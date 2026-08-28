import type {
  ApiSdkModule,
  AuthSdkModule,
  ConfigSdkModule,
  EventHandler,
  FlagsSdkModule,
  HostDescriptor,
  HttpSdkModule,
  LinksSdkModule,
  NavigationSdkModule,
  NotificationsSdkModule,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  StorageSdkModule,
} from "@lizuz/mini-app-types";
import type { RpcMetricsOptions, RpcMetricsSnapshot } from "../observability";
import type { RpcClient, RpcMiddleware, RpcRequestOptions } from "../rpc";
import type { TransportDebugInfo } from "../transport";
import type { ChatSdkModule } from "./chat.types";
import type { OnEventOptions, SdkEventMap } from "./common.types";
import type { DeviceSdkModuleWithGuards } from "./device.types";

/** A single request currently awaiting a host reply, for debug snapshots. */
export interface PendingRequestInfo {
  requestId: string;
  namespace: string;
  action: string;
  /** Milliseconds since the request was dispatched. */
  elapsedMs: number;
}

/** Runtime status of the SDK instance, for debug snapshots. */
export type SdkStatus = "initializing" | "ready" | "destroyed";

/** A one-shot, fully serializable view of an SDK instance's runtime state. */
export interface SdkDebugSnapshot {
  /** The SDK build version reported to the host during the handshake. */
  sdkVersion: string;
  /** The wire protocol version this build speaks. */
  protocolVersion: string;
  miniAppId: string;
  traceId: string;
  platformType: PlatformTypeLiteral;
  /** Namespaces the host confirmed support for; empty until `initialize()` resolves. */
  capabilities: readonly string[];
  status: SdkStatus;
  /** Debug-time view of the transport (origin pinning, started flag). */
  transport: TransportDebugInfo;
  /** Request counts, timings, failures, timeouts, and retries. */
  metrics: RpcMetricsSnapshot;
  /** Requests dispatched but not yet answered by the host. */
  pendingRequests: PendingRequestInfo[];
  /** Names of every module (built-in or registered) that has been built. */
  registeredModules: string[];
}

export type DiagnosticSeverity = "info" | "warn" | "error";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  details?: Record<string, unknown>;
}

/** The `sdk.debug` surface: runtime introspection for support and tooling. */
export interface SdkDebug {
  /**
   * A one-shot, fully serializable snapshot of the instance's runtime
   * state — version, platform, capabilities, metrics, in-flight requests,
   * and registered modules. Paste-able into a support ticket or dev tools.
   */
  snapshot(): SdkDebugSnapshot;
  /**
   * Heuristic checks over the current snapshot — e.g. missing appearance
   * hint, no capabilities after initialize, stale transport origin. Useful
   * for `npx sewa-sdk diagnose` or support tickets. Never throws.
   */
  diagnose(): Diagnostic[];
}

/**
 * The full public shape of a `MiniAppSdk` instance — this is the contract
 * vendor mini apps code against: the domain modules plus lifecycle,
 * event-subscription, and extensibility methods.
 */
export interface MiniAppSdkInterface {
  readonly miniAppId: string;
  readonly version: string;
  readonly traceId: string;
  /** Static host descriptor injected by the shell before mount, or null if running outside a GSA shell. */
  readonly hostDescriptor: HostDescriptor | null;
  /**
   * Namespaces the host confirmed it supports, negotiated during the
   * handshake in `initialize()`. Empty until `initialize()` resolves. A
   * mini app can use this to feature-detect before calling a module the
   * host might not implement, instead of only discovering that at
   * request-time via a `ProtocolError`.
   */
  readonly capabilities: readonly string[];

  auth: AuthSdkModule;
  permissions: PermissionsSdkModule;
  flags: FlagsSdkModule;
  config: ConfigSdkModule;
  navigation: NavigationSdkModule;
  storage: StorageSdkModule;
  platform: PlatformSdkModule;
  device: DeviceSdkModuleWithGuards;
  api: ApiSdkModule;
  http: HttpSdkModule;
  ai: ChatSdkModule;
  /**
   * Alias for `ai`. Prefer `chat` for new code; `ai` remains for
   * backward compatibility and will be removed in a future major.
   * @deprecated Use `chat` instead.
   */
  readonly chat: ChatSdkModule;
  /** Push notifications: permission/token registration plus tap events. */
  notifications: NotificationsSdkModule;
  /** Deep links: open external URLs and subscribe to inbound link resolution. */
  links: LinksSdkModule;
  /** Runtime introspection: `debug.snapshot()` returns a serializable view of this instance. */
  readonly debug: SdkDebug;

  initialize(): Promise<void>;
  destroy(): void;

  /**
   * Subscribes to a host-emitted event. Returns an unsubscribe function.
   * Known events get typed payloads via `SdkEventMap`; host-defined events
   * outside that map remain usable through the `string` overload.
   */
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

  /**
   * Low-level escape hatch for host calls that don't have a dedicated module
   * method yet, or need per-call control. Identical semantics to any module
   * call (retry, timeout, middleware, metrics), plus optional per-request
   * options such as an `AbortSignal`.
   */
  request<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<T>;

  /**
   * Publishes an event to the shell's internal event bus. Other shell
   * components may listen. Mini-apps cannot subscribe to each other
   * directly. Known events get typed payloads via `SdkEventMap`.
   */
  emit<K extends keyof SdkEventMap>(event: K, data: SdkEventMap[K]): void;
  emit(event: string, data?: unknown): void;

  /** Registers a middleware wrapping every request made from this point forward. See `rpc/middleware.ts`. */
  use(middleware: RpcMiddleware): void;
  /** A point-in-time snapshot of request counts, timings, failures, timeouts, and retries. */
  getMetrics(): RpcMetricsSnapshot;
  /** Adds a module beyond the nine built-in ones, backed by the same `RpcClient` every built-in module uses. */
  registerModule<T>(name: string, factory: (rpc: RpcClient) => T): void;
  /** Retrieves a module registered via `registerModule()`, or any built-in module by its namespace name. */
  getModule<T>(name: string): T | undefined;

  /**
   * Resolves after the next emission of `event`, then auto-unsubscribes.
   * Rejects if `signal` aborts before the event fires.
   */
  once<K extends keyof SdkEventMap>(
    event: K,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): Promise<SdkEventMap[K]>;
  once(
    event: string,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): Promise<unknown>;

  /**
   * Async-iterable over successive emissions of `event`. The iterator
   * completes when `signal` aborts or the consumer breaks.
   */
  events<K extends keyof SdkEventMap>(
    event: K,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): AsyncIterable<SdkEventMap[K]>;
  events(
    event: string,
    options?: OnEventOptions & { signal?: AbortSignal },
  ): AsyncIterable<unknown>;

  /**
   * Result-type variant of `request` — never throws, returns a
   * `{ok, value}` / `{ok:false, error}` envelope. Useful for
   * railway-oriented code that prefers values over exceptions.
   */
  requestSafe<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<{ ok: true; value: T } | { ok: false; error: Error }>;

  /** Installs a plugin (see `SdkPlugin`). Additive — existing `use()` remains. */
  usePlugin(plugin: {
    name: string;
    install(ctx: {
      sdk: MiniAppSdkInterface;
      rpc: RpcClient;
      logger: import("../logging").Logger;
    }): void | Promise<void>;
    onInitialize?(): Promise<void>;
    onDestroy?(): void;
  }): Promise<void>;

  /**
   * Batch multiple requests. Falls back to parallel fan-out if host does not
   * support `batch.execute`. Returns per-item ok/error to preserve partial
   * success.
   */
  batch(
    requests: Array<{
      namespace: string;
      action: string;
      payload?: unknown;
      options?: RpcRequestOptions;
    }>,
  ): Promise<Array<{ ok: true; value: unknown } | { ok: false; error: Error }>>;

  /** Registers an event interceptor (see `RpcClient.addEventInterceptor`). */
  addEventInterceptor(
    interceptor: (event: string, payload: unknown) => unknown | false,
  ): () => void;

  /** Capability versions when host sent a version map, else empty. */
  get capabilityVersions(): Readonly<Record<string, string>>;
}

/**
 * Tuning for the optional liveness check and automatic reconnection. Provide
 * `heartbeat` in `MiniAppSdkOptions` to enable it.
 */
export interface HeartbeatOptions {
  /** How often to send a `heartbeat.ping` to the host, in ms. Defaults to 30000. */
  intervalMs?: number;
  /** How long to wait for the pong before counting a miss, in ms. Defaults to 5000. */
  timeoutMs?: number;
  /** Consecutive missed pongs before the connection is declared lost. Defaults to 2. */
  maxMissedPongs?: number;
}

export interface CircuitBreakerOptions {
  /** Failures within `windowMs` to open the circuit. Default 5. */
  threshold?: number;
  /** Window for counting failures in ms. Default 10000. */
  windowMs?: number;
  /** Time the circuit stays open before half-open trial in ms. Default 30000. */
  openMs?: number;
}

export interface AdaptiveTimeoutOptions {
  enabled?: boolean;
  factor?: number;
  minMs?: number;
  maxMs?: number;
}

export interface ReliabilityOptions {
  circuitBreaker?: CircuitBreakerOptions;
  adaptiveTimeout?: AdaptiveTimeoutOptions;
}

/**
 * Constructor options for `MiniAppSdk`. `transport` is deliberately *not*
 * part of this type (see `client/MiniAppSdk.ts`) — transport injection is a
 * host-SDK concern, not something a vendor mini-app developer needs to
 * think about.
 */
export interface MiniAppSdkOptions {
  miniAppId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  /** Ceiling for the exponential retry backoff, in milliseconds. Defaults to 8000. */
  maxRetryDelayMs?: number;
  /** Origin to pin for postMessage. Mapped to `allowedOrigin` internally. */
  targetOrigin?: string;
  /**
   * When true, the SDK warns once per `namespace.action` when a request goes
   * to a domain namespace the host did not negotiate, and enables a
   * `ConsoleLogger` if no logger was injected. Defaults to the value of
   * `process.env.NODE_ENV !== "production"` (auto-detect).
   */
  devMode?: boolean;
  /**
   * Enables the built-in `ConsoleLogger` (when no `logger` is injected via
   * the constructor dependencies) at the given minimum level. Useful for
   * on-boarding a vendor onto logging without custom wiring — the
   * `ConsoleLogger` supports `redact` too, but a redaction set isn't
   * configurable from options (construct a `ConsoleLogger` for that).
   */
  logLevel?: "debug" | "info" | "warn" | "error";
  /**
   * Enables the optional heartbeat & reconnect: the SDK periodically pings
   * the host, and when `maxMissedPongs` go unanswered it emits
   * `connection.lost`, re-runs the handshake with backoff, then emits
   * `connection.established` on success. Off by default — the host must
   * answer `heartbeat.ping`.
   */
  heartbeat?: HeartbeatOptions;
  /**
   * Tuning for the request metrics recorder: the duration window used for
   * latency percentiles, and an `onSnapshot` hook a host can use to persist
   * metrics instead of polling `sdk.getMetrics()`.
   */
  metrics?: RpcMetricsOptions;
  /** Reliability tuning for circuit breaker and adaptive timeout. Off by default. */
  reliability?: ReliabilityOptions;
  /**
   * Security: whether CustomEvent channel is allowed. Default true for compat;
   * set false to harden (postMessage only).
   */
  allowCustomEvent?: boolean;
}
