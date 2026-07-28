import { SdkError } from '../errors';
import type { Logger } from '../logging';
import { noopLogger } from '../logging';
import { ACTIONS, HOST_DESCRIPTOR_GLOBAL_KEY, NAMESPACES, PROTOCOL_VERSION } from '../constants';
import {
  ModuleRegistry,
  createAuthModule,
  createConfigModule,
  createDeviceModule,
  createFlagsModule,
  createHttpModule,
  createNavigationModule,
  createPermissionsModule,
  createPlatformModule,
} from '../modules';
import type { ModuleFactory } from '../modules';
import type { RpcMetricsSnapshot } from '../observability';
import type { RpcMiddleware } from '../rpc';
import { RpcClient } from '../rpc';
import { DefaultTransport } from '../transport';
import type { Transport } from '../transport';
import type {
  AuthSdkModule,
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
} from '../types';

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
  readonly platform: PlatformSdkModule;
  readonly device: DeviceSdkModule;
  readonly http: HttpSdkModule;

  private readonly rpc: RpcClient;
  private readonly logger: Logger;
  private readonly registry = new ModuleRegistry();
  private readonly setPlatformType: (type: PlatformTypeLiteral) => void;

  private initialized = false;
  private destroyed = false;
  private initializePromise: Promise<void> | null = null;

  constructor(options: MiniAppSdkOptions, dependencies: MiniAppSdkDependencies = {}) {
    this.miniAppId = options.miniAppId;
    this.logger = dependencies.logger ?? noopLogger;

    this.hostDescriptor = typeof window !== 'undefined'
      ? (window as any)[HOST_DESCRIPTOR_GLOBAL_KEY] ?? null
      : null;

    const transport =
      dependencies.transport ?? new DefaultTransport({ logger: this.logger, allowedOrigin: dependencies.allowedOrigin });
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
    this.registry.register(NAMESPACES.DEVICE, createDeviceModule);
    this.registry.register(NAMESPACES.HTTP, createHttpModule);
    this.registry.build(this.rpc);

    this.auth = this.registry.get<AuthSdkModule>(NAMESPACES.AUTH)!;
    this.permissions = this.registry.get<PermissionsSdkModule>(NAMESPACES.PERMISSIONS)!;
    this.flags = this.registry.get<FlagsSdkModule>(NAMESPACES.FLAGS)!;
    this.config = this.registry.get<ConfigSdkModule>(NAMESPACES.CONFIG)!;
    this.navigation = this.registry.get<NavigationSdkModule>(NAMESPACES.NAVIGATION)!;
    this.device = this.registry.get<DeviceSdkModule>(NAMESPACES.DEVICE)!;
    this.http = this.registry.get<HttpSdkModule>(NAMESPACES.HTTP)!;

    const platformHandle = createPlatformModule('WEB');
    this.platform = platformHandle.module;
    this.setPlatformType = platformHandle.setType;
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
        code: 'SDK_ALREADY_DESTROYED',
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
    const platformType = await this.rpc.request<PlatformTypeLiteral>(NAMESPACES.PLATFORM, ACTIONS.PLATFORM.GET_TYPE);
    this.setPlatformType(platformType);
    this.initialized = true;
    this.logger.info(`MiniAppSdk("${this.miniAppId}") initialized`, { platformType });
  }

  /**
   * Tears down the transport and clears all pending state. Safe to call
   * more than once. After `destroy()`, this instance cannot be
   * re-initialized — construct a new `MiniAppSdk` instead.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.rpc.stop();
    this.initialized = false;
    this.destroyed = true;
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
    this.rpc.request(NAMESPACES.EVENT, ACTIONS.EVENT.EMIT, { event, data }).catch((error: unknown) => {
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
