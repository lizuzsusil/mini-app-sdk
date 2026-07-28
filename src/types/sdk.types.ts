import type { AuthSdkModule, PermissionsSdkModule } from './auth.types';
import type { ConfigSdkModule, FlagsSdkModule } from './config.types';
import type { EventHandler } from './common.types';
import type { NavigationSdkModule } from './navigation.types';
import type { PlatformSdkModule } from './platform.types';
import type { DeviceSdkModule } from './device.types';
import type { HttpSdkModule } from './http.types';
import type { RpcClient, RpcMiddleware } from '../rpc';
import type { RpcMetricsSnapshot } from '../observability';

/**
 * The full public shape of a `MiniAppSdk` instance — this is the contract
 * vendor mini apps code against: eight domain modules plus lifecycle,
 * event-subscription, and extensibility methods.
 */
export interface MiniAppSdkInterface {
  readonly moduleId: string;
  readonly version: string;
  readonly traceId: string;
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
  platform: PlatformSdkModule;
  device: DeviceSdkModule;
  http: HttpSdkModule;

  initialize(): Promise<void>;
  destroy(): void;
  on(event: string, handler: EventHandler): () => void;

  /** Registers a middleware wrapping every request made from this point forward. See `rpc/middleware.ts`. */
  use(middleware: RpcMiddleware): void;
  /** A point-in-time snapshot of request counts, timings, failures, timeouts, and retries. */
  getMetrics(): RpcMetricsSnapshot;
  /** Adds a module beyond the nine built-in ones, backed by the same `RpcClient` every built-in module uses. */
  registerModule<T>(name: string, factory: (rpc: RpcClient) => T): void;
  /** Retrieves a module registered via `registerModule()`, or any built-in module by its namespace name. */
  getModule<T>(name: string): T | undefined;
}

export interface CreateInstanceOptions {
  moduleId: string;
  channel?: string;
  sdkOptions?: MiniAppSdkOptions;
};

/**
 * Constructor options for `MiniAppSdk`. `transport` is deliberately *not*
 * part of this type (see `client/MiniAppSdk.ts`) — transport injection is a
 * host-SDK concern, not something a vendor mini-app developer needs to
 * think about.
 */
export interface MiniAppSdkOptions {
  moduleId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  /** Ceiling for the exponential retry backoff, in milliseconds. Defaults to 8000. */
  maxRetryDelayMs?: number;
  /** Origin to pin for postMessage. Mapped to `allowedOrigin` internally. */
  targetOrigin?: string;
}
