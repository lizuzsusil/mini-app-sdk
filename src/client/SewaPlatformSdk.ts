import {
  ACTIONS,
  HOST_DESCRIPTOR_GLOBAL_KEY,
  NAMESPACES,
  PROTOCOL_VERSION,
} from "../constants";
import { SdkError } from "../errors";
import type { Logger } from "../logging";
import { ConsoleLogger, noopLogger } from "../logging";
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
  createConfigModule,
  createDeviceModule,
  createLinksModule,
  createNavigationModule,
  createNotificationsModule,
  createPermissionsModule,
  createPlatformModule,
  createStorageModule,
  ModuleRegistry,
} from "../modules";
import type { RpcMetricsSnapshot, Tracer } from "../observability";
import type { RpcMiddleware, RpcRequestOptions } from "../rpc";
import { RpcClient } from "../rpc";
import type { SseStreamEvent } from "../stream/sse-parser";
import { parseSseStream } from "../stream/sse-parser";
import type { Transport } from "../transport";
import { DefaultTransport } from "../transport";
import type {
  ApiSdkModule,
  AppearanceSdkModule,
  AuthSdkModule,
  ConfigSdkModule,
  DeviceSdkModuleWithGuards,
  Diagnostic,
  EventHandler,
  HostDescriptor,
  LinksSdkModule,
  NavigationSdkModule,
  NotificationsSdkModule,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  SdkDebug,
  SdkDebugSnapshot,
  SdkPlugin,
  SewaPlatformSdkInterface,
  SewaPlatformSdkOptions,
  StorageSdkModule,
} from "../types";
import type {
  OnEventOptions,
  PlatformTypeResponse,
  SdkEventMap,
} from "../types/common.types";
import { validateSdkOptions } from "../types/validate-options";
import { delay } from "../utils";
import {
  getInstance as getRegistryInstance,
  registerInstance,
  unregisterInstance,
} from "./instance-registry";

export interface SewaPlatformSdkDependencies {
  transport?: Transport;
  logger?: Logger;
  allowedOrigin?: string;
  tracer?: Tracer;
}

const APPEARANCE_HYDRATION_BUDGET_MS = 1200;

export type { SdkPlugin } from "../types";

export class SewaPlatformSdk implements SewaPlatformSdkInterface {
  readonly miniAppId: string;
  readonly version = PROTOCOL_VERSION;
  readonly traceId: string;

  readonly hostDescriptor: HostDescriptor | null;

  readonly auth: AuthSdkModule;
  readonly permissions: PermissionsSdkModule;
  readonly config: ConfigSdkModule;
  readonly navigation: NavigationSdkModule;
  readonly api: ApiSdkModule;
  readonly storage: StorageSdkModule;
  readonly platform: PlatformSdkModule;
  readonly device: DeviceSdkModuleWithGuards;
  readonly appearance: AppearanceSdkModule;
  readonly notifications: NotificationsSdkModule;
  readonly links: LinksSdkModule;
  readonly debug: SdkDebug;

  readonly stream: {
    parseSseStream: (
      chunks: AsyncIterable<string | Uint8Array>,
    ) => AsyncGenerator<SseStreamEvent>;
  };

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
  private readonly plugins: SdkPlugin[] = [];

  constructor(
    options: SewaPlatformSdkOptions,
    dependencies: SewaPlatformSdkDependencies = {},
  ) {
    validateSdkOptions(options);
    this.miniAppId = options.miniAppId;
    const devMode = SewaPlatformSdk.resolveDevMode(options);
    this.logger =
      dependencies.logger ??
      (options.logLevel !== undefined || devMode
        ? new ConsoleLogger({ minLevel: options.logLevel })
        : noopLogger);

    this.hostDescriptor =
      typeof window !== "undefined"
        ? (((window as unknown as Record<string, unknown>)[
            HOST_DESCRIPTOR_GLOBAL_KEY
          ] as HostDescriptor | undefined) ?? null)
        : null;

    const transport =
      dependencies.transport ??
      new DefaultTransport({
        logger: this.logger,
        allowedOrigin: dependencies.allowedOrigin,
        allowCustomEvent: options.allowCustomEvent,
      });
    this.rpc = new RpcClient(transport, {
      miniAppId: options.miniAppId,
      timeout: options.timeout,
      retryAttempts: options.retryAttempts,
      retryDelayMs: options.retryDelayMs,
      maxRetryDelayMs: options.maxRetryDelayMs,
      logger: this.logger,
      devMode,
      heartbeat: options.heartbeat,
      metrics: options.metrics,
      circuitBreaker: options.reliability?.circuitBreaker,
      adaptiveTimeout: options.reliability?.adaptiveTimeout,
      tracer: dependencies.tracer,
    });
    this.traceId = this.rpc.getTraceId();

    this.registry.register(NAMESPACES.AUTH, createAuthModule);
    this.registry.register(NAMESPACES.PERMISSIONS, createPermissionsModule);
    this.registry.register(NAMESPACES.CONFIG, createConfigModule);
    this.registry.register(NAMESPACES.NAVIGATION, createNavigationModule);
    this.registry.register(NAMESPACES.STORAGE, createStorageModule);
    this.registry.register(NAMESPACES.DEVICE, createDeviceModule);
    this.registry.register(NAMESPACES.API, createApiModule);
    this.registry.register(NAMESPACES.NOTIFICATIONS, createNotificationsModule);
    this.registry.register(NAMESPACES.LINKS, createLinksModule);
    this.registry.build(this.rpc);

    this.auth = this.requireModule<AuthSdkModule>(NAMESPACES.AUTH);
    this.permissions = this.requireModule<PermissionsSdkModule>(
      NAMESPACES.PERMISSIONS,
    );
    this.config = this.requireModule<ConfigSdkModule>(NAMESPACES.CONFIG);
    this.navigation = this.requireModule<NavigationSdkModule>(
      NAMESPACES.NAVIGATION,
    );
    this.storage = this.requireModule<StorageSdkModule>(NAMESPACES.STORAGE);
    this.device = this.requireModule<DeviceSdkModuleWithGuards>(
      NAMESPACES.DEVICE,
    );
    this.api = this.requireModule<ApiSdkModule>(NAMESPACES.API);
    this.notifications = this.requireModule<NotificationsSdkModule>(
      NAMESPACES.NOTIFICATIONS,
    );
    this.links = this.requireModule<LinksSdkModule>(NAMESPACES.LINKS);

    const platformHandle = createPlatformModule("web");
    this.platform = platformHandle.module;
    this.applyPlatformResponse = platformHandle.applyResponse;

    this.appearanceHandle = createAppearanceModule(this.rpc);
    this.appearance = this.appearanceHandle.module;

    this.request = this.request.bind(this);
    this.requestSafe = this.requestSafe.bind(this);

    this.stream = { parseSseStream };

    this.debug = {
      snapshot: (): SdkDebugSnapshot => ({
        sdkVersion: this.rpc.getSdkVersion(),
        protocolVersion: this.version,
        miniAppId: this.miniAppId,
        traceId: this.traceId,
        platformType: this.platform.type,
        capabilities: this.capabilities,
        status: this.destroyed
          ? "destroyed"
          : this.initialized
            ? "ready"
            : "initializing",
        transport: this.rpc.getTransportDebugInfo(),
        metrics: this.getMetrics(),
        pendingRequests: this.rpc.getPendingRequests(),
        registeredModules: this.registry.list(),
      }),
      diagnose: (): Diagnostic[] => this.diagnose(),
    };

    registerInstance(this);
  }

  private static resolveDevMode(options: SewaPlatformSdkOptions): boolean {
    if (options.devMode !== undefined) return options.devMode;
    const env = (
      globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env;
    return env?.NODE_ENV !== undefined && env.NODE_ENV !== "production";
  }

  private requireModule<T>(name: string): T {
    const module = this.registry.get<T>(name);
    if (!module) {
      throw new SdkError({
        code: "SDK_NOT_INITIALIZED",
        message: `Module "${name}" was not registered with the SDK.`,
      });
    }
    return module;
  }

  get capabilities(): readonly string[] {
    return this.rpc.getCapabilities();
  }

  async initialize(): Promise<void> {
    if (this.destroyed) {
      throw new SdkError({
        code: "SDK_ALREADY_DESTROYED",
        message: `Cannot initialize SewaPlatformSdk("${this.miniAppId}") — this instance has already been destroyed.`,
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

    const raw = await this.rpc.request<
      PlatformTypeLiteral | PlatformTypeResponse
    >(NAMESPACES.PLATFORM, ACTIONS.PLATFORM.GET_TYPE);
    const { type: platformType, appearance: appearanceHint } =
      this.applyPlatformResponse(raw);

    this.subscribeToAppearanceEvents();

    if (appearanceHint) {
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
    for (const plugin of this.plugins) {
      try {
        await plugin.onInitialize?.();
      } catch (error) {
        this.logger.warn(`Plugin "${plugin.name}" onInitialize threw`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.info(`SewaPlatformSdk("${this.miniAppId}") initialized`, {
      platformType,
    });
  }

  private subscribeToAppearanceEvents(): void {
    this.appearanceUnsubscribers.push(
      this.on(APPEARANCE_EVENTS.LOCALE_CHANGED, (payload) => {
        this.appearanceHandle.applyHint({ locale: payload });
      }),
      this.on(APPEARANCE_EVENTS.THEME_CHANGED, (payload) => {
        this.appearanceHandle.applyHint({ theme: payload });
      }),
    );
  }

  private async hydrateAppearance(): Promise<void> {
    const hydration = Promise.all([
      this.appearance.getLocale(),
      this.appearance.getTheme(),
    ]).catch(() => undefined);
    await Promise.race([hydration, delay(APPEARANCE_HYDRATION_BUDGET_MS)]);
  }

  private diagnose(): Diagnostic[] {
    const diags: Diagnostic[] = [];
    const snap = this.debug.snapshot();

    try {
      if (!this.initialized && !this.destroyed) {
        diags.push({
          code: "NOT_INITIALIZED",
          severity: "info",
          message:
            "SDK not yet initialized — capabilities empty until initialize() resolves",
          details: { miniAppId: this.miniAppId },
        });
      }
      if (this.destroyed) {
        diags.push({
          code: "DESTROYED",
          severity: "warn",
          message:
            "SDK instance has been destroyed and cannot be re-initialized",
          details: { miniAppId: this.miniAppId },
        });
      }
      if (this.initialized && this.capabilities.length === 0) {
        diags.push({
          code: "NO_CAPABILITIES",
          severity: "warn",
          message:
            "No capabilities negotiated — host may not have answered handshake or capabilities list empty",
          details: { traceId: this.traceId },
        });
      }
      const pending = this.rpc.getPendingRequests();
      if (pending.length > 5) {
        diags.push({
          code: "PENDING_BACKLOG",
          severity: "warn",
          message: `High pending request backlog: ${pending.length} requests awaiting host reply`,
          details: { pendingRequests: pending },
        });
      }
      const transportInfo = this.rpc.getTransportDebugInfo();
      if (!transportInfo.started && this.initialized) {
        diags.push({
          code: "TRANSPORT_NOT_STARTED",
          severity: "error",
          message:
            "Transport not started while SDK is initialized — messages will not be delivered",
          details: { transport: transportInfo },
        });
      }
      const snapMetrics = snap.metrics;
      if (snapMetrics.totalRequests > 0) {
        const failureRate =
          snapMetrics.totalFailures / snapMetrics.totalRequests;
        if (failureRate > 0.5 && snapMetrics.totalRequests > 10) {
          diags.push({
            code: "HIGH_FAILURE_RATE",
            severity: "warn",
            message: `High request failure rate: ${(failureRate * 100).toFixed(1)}% of ${snapMetrics.totalRequests} requests failed`,
            details: {
              failures: snapMetrics.totalFailures,
              total: snapMetrics.totalRequests,
            },
          });
        }
      }
      const appearanceState = this.appearance.state();
      if (!appearanceState.locale || !appearanceState.theme) {
        diags.push({
          code: "APPEARANCE_INCOMPLETE",
          severity: "info",
          message:
            "Appearance state incomplete — host may not have sent hint and appearance namespace not negotiated",
          details: {
            locale: appearanceState.locale,
            theme: appearanceState.theme,
            capabilities: this.capabilities,
          },
        });
      }
      if (this.plugins.length > 0) {
        diags.push({
          code: "PLUGINS_ACTIVE",
          severity: "info",
          message: `${this.plugins.length} plugin(s) active`,
          details: { plugins: this.plugins.map((p) => p.name) },
        });
      }
    } catch (error) {
      diags.push({
        code: "DIAGNOSE_ERROR",
        severity: "error",
        message: `diagnose() internal error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return diags;
  }

  destroy(): void {
    if (this.destroyed) return;
    for (const plugin of [...this.plugins].reverse()) {
      try {
        plugin.onDestroy?.();
      } catch (error) {
        this.logger.warn(`Plugin "${plugin.name}" onDestroy threw`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.rpc.stop();
    for (const unsub of this.appearanceUnsubscribers) unsub();
    this.appearanceUnsubscribers.length = 0;
    this.initialized = false;
    this.destroyed = true;
    unregisterInstance(this);
    this.logger.info(`SewaPlatformSdk("${this.miniAppId}") destroyed`);
  }

  on<K extends keyof SdkEventMap>(
    event: K,
    handler: (payload: SdkEventMap[K]) => void,
    options?: OnEventOptions,
  ): () => void;
  on(
    event: string,
    handler: EventHandler,
    options?: OnEventOptions,
  ): () => void;
  on(
    event: string,
    handler: EventHandler,
    options?: OnEventOptions,
  ): () => void {
    return this.rpc.onEvent(event, handler, options);
  }

  once<K extends keyof SdkEventMap>(
    event: K,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): Promise<SdkEventMap[K]>;
  once(
    event: string,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): Promise<unknown>;
  once(
    event: string,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(
          new SdkError({
            code: "REQUEST_CANCELLED",
            message: `once("${event}") cancelled via AbortSignal`,
            cause: options.signal.reason,
          }),
        );
        return;
      }
      const unsubscribe = this.on(event, (payload) => {
        unsubscribe();
        options?.signal?.removeEventListener("abort", onAbort);
        resolve(payload);
      });
      const onAbort = (): void => {
        unsubscribe();
        reject(
          new SdkError({
            code: "REQUEST_CANCELLED",
            message: `once("${event}") cancelled via AbortSignal`,
            cause: options?.signal?.reason,
          }),
        );
      };
      options?.signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  events<K extends keyof SdkEventMap>(
    event: K,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): AsyncIterable<SdkEventMap[K]>;
  events(
    event: string,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): AsyncIterable<unknown>;
  events(
    event: string,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): AsyncIterable<unknown> {
    const sdk = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<unknown> {
        const queue: unknown[] = [];
        let pendingResolve: ((v: IteratorResult<unknown>) => void) | null =
          null;
        let done = false;
        const unsubscribe = sdk.on(
          event,
          (payload) => {
            if (pendingResolve) {
              const r = pendingResolve;
              pendingResolve = null;
              r({ value: payload, done: false });
            } else {
              queue.push(payload);
            }
          },
          { replay: options?.replay },
        );

        const onAbort = (): void => {
          done = true;
          if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            r({ value: undefined, done: true });
          }
          unsubscribe();
        };
        if (options?.signal) {
          if (options.signal.aborted) onAbort();
          else
            options.signal.addEventListener("abort", onAbort, { once: true });
        }

        return {
          next(): Promise<IteratorResult<unknown>> {
            if (done) return Promise.resolve({ value: undefined, done: true });
            if (queue.length > 0) {
              return Promise.resolve({ value: queue.shift(), done: false });
            }
            return new Promise<IteratorResult<unknown>>((resolve) => {
              pendingResolve = resolve;
            });
          },
          return(): Promise<IteratorResult<unknown>> {
            done = true;
            options?.signal?.removeEventListener("abort", onAbort);
            unsubscribe();
            if (pendingResolve) {
              const r = pendingResolve;
              pendingResolve = null;
              r({ value: undefined, done: true });
            }
            return Promise.resolve({ value: undefined, done: true });
          },
        };
      },
    };
  }

  request<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<T> {
    return this.rpc.request<T>(namespace, action, payload, options);
  }

  async requestSafe<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
    try {
      const value = await this.request<T>(namespace, action, payload, options);
      return { ok: true, value };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /** {@inheritdoc} */
  emit<K extends keyof SdkEventMap>(event: K, data: SdkEventMap[K]): void;
  emit(event: string, data?: unknown): void;
  emit(event: string, data?: unknown): void {
    this.rpc
      .request(NAMESPACES.EVENT, ACTIONS.EVENT.EMIT, { event, data })
      .catch((error: unknown) => {
        this.logger.warn(`Emit event "${event}" failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  use(middleware: RpcMiddleware): void {
    this.rpc.use(middleware);
  }

  async usePlugin(plugin: SdkPlugin): Promise<void> {
    if (this.plugins.some((p) => p.name === plugin.name)) {
      this.logger.warn(`Plugin "${plugin.name}" already installed — skipping`);
      return;
    }
    await plugin.install({ sdk: this, rpc: this.rpc, logger: this.logger });
    this.plugins.push(plugin);
    if (this.initialized) {
      try {
        await plugin.onInitialize?.();
      } catch (error) {
        this.logger.warn(`Plugin "${plugin.name}" onInitialize threw`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  getMetrics(): RpcMetricsSnapshot {
    return this.rpc.getMetrics();
  }

  batch(
    requests: Array<{
      namespace: string;
      action: string;
      payload?: unknown;
      options?: RpcRequestOptions;
    }>,
  ): Promise<
    Array<{ ok: true; value: unknown } | { ok: false; error: Error }>
  > {
    return this.rpc.batch(requests);
  }

  addEventInterceptor(
    interceptor: (event: string, payload: unknown) => unknown | false,
  ): () => void {
    return this.rpc.addEventInterceptor(interceptor);
  }

  get capabilityVersions(): Readonly<Record<string, string>> {
    return this.rpc.getCapabilityVersions();
  }

  registerModule<T>(name: string, factory: ModuleFactory<T>): void {
    this.registry.register(name, factory);
    this.registry.build(this.rpc);
  }

  registerLazyModule<T>(
    name: string,
    factory: () =>
      | Promise<(rpc: import("../rpc").RpcClient) => T>
      | ((rpc: import("../rpc").RpcClient) => T),
  ): void {
    this.registry.registerLazy(
      name,
      factory as unknown as import("../modules/module-registry").LazyModuleFactory,
    );
  }

  getModule<T>(name: string): T | undefined {
    return this.registry.get<T>(name);
  }

  async getModuleAsync<T>(name: string): Promise<T | undefined> {
    return this.registry.getAsync<T>(name, this.rpc);
  }

  static getInstance(miniAppId?: string): SewaPlatformSdk | undefined {
    return getRegistryInstance(miniAppId);
  }
}
