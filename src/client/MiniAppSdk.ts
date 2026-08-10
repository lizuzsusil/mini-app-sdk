import {
  ACTIONS,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  NAMESPACES,
  PROTOCOL_VERSION,
  SDK_GLOBAL_KEY,
} from "../constants";
import { SdkError } from "../errors";
import type { Logger } from "../logging";
import { noopLogger } from "../logging";
import type {
  AppearanceModuleHandle,
  ModuleFactory,
  ResolvedPlatformResponse,
} from "../modules";
import {
  APPEARANCE_EVENTS,
  createApiModule,
  createAppearanceModule,
  createAuthModule,
  createChatModule,
  createConfigModule,
  createDeviceModule,
  createFlagsModule,
  createHttpModule,
  createNavigationModule,
  createPermissionsModule,
  createPlatformModule,
  createStorageModule,
  ModuleRegistry,
} from "../modules";
import type { RpcMetricsSnapshot } from "../observability";
import type { RpcMiddleware } from "../rpc";
import { RpcClient } from "../rpc";
import type { Transport } from "../transport";
import { DefaultTransport } from "../transport";
import type {
  ApiSdkModule,
  AppearanceSdkModule,
  AuthSdkModule,
  ChatSdkModule,
  ConfigSdkModule,
  DeviceSdkModule,
  EventHandler,
  FlagsSdkModule,
  HostDescriptor,
  HttpSdkModule,
  MiniAppSdkInterface,
  MiniAppSdkOptions,
  NavigationSdkModule,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  StorageSdkModule,
} from "../types";
import type {
  AppearanceType,
  PlatformTypeResponse,
} from "../types/common.types";
import { delay } from "../utils";

/**
 * Extra, internal-only construction knobs. Deliberately **not** part of
 * `MiniAppSdkOptions` (the public, vendor-facing options type) — a vendor
 * mini-app developer configures `miniAppId`/`timeout`/`retryAttempts` the
 * same way they always have. `transport`, `logger`, and `allowedOrigin` are
 * for host SDKs and internal callers: `transport` to inject a non-default
 * delivery mechanism, `logger` to wire up real logging, and
 * `allowedOrigin` to pin `DefaultTransport` to a known host origin from the
 * start instead of learning it from the first message (see
 * `transport/DefaultTransport.ts`). `allowedOrigin` is ignored if a custom
 * `transport` is also provided — origin handling is that transport's own
 * concern at that point.
 */
export interface MiniAppSdkDependencies {
  transport?: Transport;
  logger?: Logger;
  allowedOrigin?: string;
}

/** Upper bound on appearance hydration during `initialize()`. */
const APPEARANCE_HYDRATION_BUDGET_MS = 1200;

/**
 * The SDK's composition root. `MiniAppSdk`'s only responsibilities are:
 *  1. composing the `RpcClient`, the `ModuleRegistry`, and all domain
 *     modules,
 *  2. owning instance lifecycle (`initialize` / `destroy`),
 *  3. exposing the public API surface (`MiniAppSdkInterface`).
 *
 * It contains no RPC logic (that's `RpcClient`), no transport wiring
 * (that's `Transport`/`DefaultTransport`), and no per-module business logic
 * (that's `modules/*`). If you're about to add a `namespace`/`action`
 * string or a `.request()` call directly in this file, it almost certainly
 * belongs in a module file instead.
 */
export class MiniAppSdk implements MiniAppSdkInterface {
  readonly miniAppId: string;
  readonly version = PROTOCOL_VERSION;
  readonly traceId: string;

  readonly hostDescriptor: HostDescriptor | null;

  readonly auth: AuthSdkModule;
  readonly permissions: PermissionsSdkModule;
  readonly flags: FlagsSdkModule;
  readonly config: ConfigSdkModule;
  readonly navigation: NavigationSdkModule;
  readonly api: ApiSdkModule;
  readonly storage: StorageSdkModule;
  readonly platform: PlatformSdkModule;
  readonly device: DeviceSdkModule;
  readonly http: HttpSdkModule;
  readonly ai: ChatSdkModule;
  readonly appearance: AppearanceSdkModule;

  private readonly rpc: RpcClient;
  private readonly logger: Logger;
  private readonly registry = new ModuleRegistry();
  private readonly applyPlatformResponse: (
    raw: unknown,
  ) => ResolvedPlatformResponse;
  private readonly appearanceHandle: AppearanceModuleHandle;
  private readonly appearanceUnsubscribers: Array<() => void> = [];

  private initialized = false;
  private destroyed = false;
  private initializePromise: Promise<void> | null = null;

  constructor(
    options: MiniAppSdkOptions,
    dependencies: MiniAppSdkDependencies = {},
  ) {
    this.miniAppId = options.miniAppId;
    this.logger = dependencies.logger ?? noopLogger;

    this.hostDescriptor =
      typeof window !== "undefined"
        ? ((window as any)[HOST_DESCRIPTOR_GLOBAL_KEY] ?? null)
        : null;

    const transport =
      dependencies.transport ??
      new DefaultTransport({
        logger: this.logger,
        allowedOrigin: dependencies.allowedOrigin,
      });
    this.rpc = new RpcClient(transport, {
      miniAppId: options.miniAppId,
      timeout: options.timeout,
      retryAttempts: options.retryAttempts,
      retryDelayMs: options.retryDelayMs,
      maxRetryDelayMs: options.maxRetryDelayMs,
      logger: this.logger,
    });
    this.traceId = this.rpc.getTraceId();

    // The eight built-in modules are registered by name instead of being
    // new'd directly, so `registerModule`/`getModule` work uniformly for
    // built-ins and anything a host or vendor adds later. `platform` is
    // registered separately below since its factory needs a slightly
    // different shape (see `createPlatformModule`'s doc comment).
    this.registry.register(NAMESPACES.AUTH, createAuthModule);
    this.registry.register(NAMESPACES.PERMISSIONS, createPermissionsModule);
    this.registry.register(NAMESPACES.FLAGS, createFlagsModule);
    this.registry.register(NAMESPACES.CONFIG, createConfigModule);
    this.registry.register(NAMESPACES.NAVIGATION, createNavigationModule);
    this.registry.register(NAMESPACES.STORAGE, createStorageModule);
    this.registry.register(NAMESPACES.DEVICE, createDeviceModule);
    this.registry.register(NAMESPACES.API, createApiModule);
    this.registry.register(NAMESPACES.HTTP, createHttpModule);
    this.registry.register(NAMESPACES.AI, createChatModule);
    this.registry.build(this.rpc);

    this.auth = this.registry.get<AuthSdkModule>(NAMESPACES.AUTH)!;
    this.permissions = this.registry.get<PermissionsSdkModule>(
      NAMESPACES.PERMISSIONS,
    )!;
    this.flags = this.registry.get<FlagsSdkModule>(NAMESPACES.FLAGS)!;
    this.config = this.registry.get<ConfigSdkModule>(NAMESPACES.CONFIG)!;
    this.navigation = this.registry.get<NavigationSdkModule>(
      NAMESPACES.NAVIGATION,
    )!;
    this.storage = this.registry.get<StorageSdkModule>(NAMESPACES.STORAGE)!;
    this.device = this.registry.get<DeviceSdkModule>(NAMESPACES.DEVICE)!;
    this.api = this.registry.get<ApiSdkModule>(NAMESPACES.API)!;
    this.http = this.registry.get<HttpSdkModule>(NAMESPACES.HTTP)!;
    this.ai = this.registry.get<ChatSdkModule>(NAMESPACES.AI)!;

    const platformHandle = createPlatformModule("web");
    this.platform = platformHandle.module;
    this.applyPlatformResponse = platformHandle.applyResponse;

    this.appearanceHandle = createAppearanceModule(this.rpc);
    this.appearance = this.appearanceHandle.module;

    if (typeof globalThis !== "undefined") {
      (globalThis as any)[SDK_GLOBAL_KEY] = this;
    }
  }

  /**
   * Namespaces the host confirmed support for during the handshake. Empty
   * until `initialize()` resolves.
   */
  get capabilities(): readonly string[] {
    return this.rpc.getCapabilities();
  }

  /**
   * Starts the transport, performs the handshake, and resolves the current
   * platform type. Idempotent and concurrency-safe: calling `initialize()`
   * multiple times (including while a prior call is still in flight)
   * returns the same underlying promise instead of re-running the sequence.
   */
  async initialize(): Promise<void> {
    if (this.destroyed) {
      throw new SdkError({
        code: "SDK_ALREADY_DESTROYED",
        message: `Cannot initialize MiniAppSdk("${this.miniAppId}") — this instance has already been destroyed.`,
      });
    }
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = this.runInitializeSequence();
    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async runInitializeSequence(): Promise<void> {
    this.rpc.start();
    await this.rpc.handshake();

    // `platform.getType` answers in one of two shapes — a bare
    // `"web"`/`"flutter"` string, or an object that also carries the host's
    // appearance hint. `applyResponse` accepts both and hands back whichever
    // hint rode along.
    const raw = await this.rpc.request<
      PlatformTypeLiteral | PlatformTypeResponse
    >(NAMESPACES.PLATFORM, ACTIONS.PLATFORM.GET_TYPE);
    const { type: platformType, appearance: appearanceHint } =
      this.applyPlatformResponse(raw);

    // Host changes must be observed on every shell, including the Flutter
    // one that delivers appearance via the hint and never negotiates the
    // `appearance` namespace — so this is not gated on capabilities.
    this.subscribeToAppearanceEvents();

    if (appearanceHint) {
      // The hint already carries the host's current locale/theme, so the
      // `appearance.*` round trips below would only re-fetch what we have.
      this.appearanceHandle.applyHint(appearanceHint);
    } else if (this.capabilities.includes(NAMESPACES.APPEARANCE)) {
      await this.hydrateAppearance();
    } else {
      this.logger.debug(
        "Host sent no appearance hint and did not negotiate appearance; using defaults",
        {
          capabilities: this.capabilities,
        },
      );
    }

    this.initialized = true;
    this.logger.info(`MiniAppSdk("${this.miniAppId}") initialized`, {
      platformType,
    });
  }

  private subscribeToAppearanceEvents(): void {
    this.appearanceUnsubscribers.push(
      this.on(APPEARANCE_EVENTS.LOCALE_CHANGED, (payload) => {
        this.appearanceHandle.applyHint({
          locale: payload as AppearanceType["locale"],
        });
      }),
      this.on(APPEARANCE_EVENTS.THEME_CHANGED, (payload) => {
        this.appearanceHandle.applyHint({
          theme: payload as AppearanceType["theme"],
        });
      }),
    );
  }

  /**
   * Fallback for hosts that implement the `appearance` namespace but don't
   * put the hint on `platform.getType` — i.e. any shell built against an
   * earlier SDK. Bounded budget: appearance is additive and must never block
   * first paint. If the host is slow or doesn't answer, initialize() still
   * resolves and the app falls back to the store defaults.
   */
  private async hydrateAppearance(): Promise<void> {
    const hydration = Promise.all([
      this.appearance.getLocale(),
      this.appearance.getTheme(),
    ]).catch(() => undefined);
    await Promise.race([hydration, delay(APPEARANCE_HYDRATION_BUDGET_MS)]);
  }

  /**
   * Tears down the transport and clears all pending state. Safe to call
   * more than once. After `destroy()`, this instance cannot be
   * re-initialized — construct a new `MiniAppSdk` instead.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.rpc.stop();
    for (const unsub of this.appearanceUnsubscribers) unsub();
    this.appearanceUnsubscribers.length = 0;
    this.initialized = false;
    this.destroyed = true;
    if (
      typeof globalThis !== "undefined" &&
      (globalThis as any)[SDK_GLOBAL_KEY] === this
    ) {
      delete (globalThis as any)[SDK_GLOBAL_KEY];
    }
    this.logger.info(`MiniAppSdk("${this.miniAppId}") destroyed`);
  }

  /**
   * Subscribes to a host-emitted event. Returns an unsubscribe function.
   * Delegates entirely to `RpcClient`; the only value this method adds over
   * calling `rpc.onEvent` directly is that it's part of the stable public
   * surface consumers already depend on.
   */
  on(event: string, handler: EventHandler): () => void {
    return this.rpc.onEvent(event, handler);
  }

  /** @inheritdoc */
  emit(event: string, data?: unknown): void {
    this.rpc
      .request(NAMESPACES.EVENT, ACTIONS.EVENT.EMIT, { event, data })
      .catch((error: unknown) => {
        this.logger.warn(`Emit event "${event}" failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Registers a middleware that wraps every request made through any
   * module from this point forward — logging, auth-token refresh, request
   * shaping, custom metrics, whatever a host or vendor needs. See
   * `rpc/middleware.ts` for the execution model.
   */
  use(middleware: RpcMiddleware): void {
    this.rpc.use(middleware);
  }

  /**
   * A point-in-time snapshot of every request this instance has made:
   * totals plus a per-`namespace.action` breakdown of counts, timings,
   * failures, timeouts, and retries.
   */
  getMetrics(): RpcMetricsSnapshot {
    return this.rpc.getMetrics();
  }

  /**
   * Adds a module beyond the nine built-in ones — for a host-specific
   * capability or a vendor's own namespace — without needing to fork the
   * SDK. The factory receives the same `RpcClient` every built-in module
   * uses, so a custom module gets retry, timeout, and middleware behavior
   * for free. Retrieve it later with `getModule()`.
   *
   * ```ts
   * sdk.registerModule('payments', (rpc) => ({
   *   charge: (amount: number) => rpc.request('payments', 'charge', { amount }),
   * }));
   * const payments = sdk.getModule<{ charge(amount: number): Promise<void> }>('payments');
   * ```
   */
  registerModule<T>(name: string, factory: ModuleFactory<T>): void {
    this.registry.register(name, factory);
    this.registry.build(this.rpc);
  }

  /** Retrieves a module registered via `registerModule()` (or any built-in module, by its namespace name). */
  getModule<T>(name: string): T | undefined {
    return this.registry.get<T>(name);
  }
}
