import type {
  AuthSdkModule,
  PermissionsSdkModule,
  ConfigSdkModule,
  FlagsSdkModule,
  EventHandler,
  NavigationSdkModule,
  HostDescriptor,
  PlatformSdkModule,
  DeviceSdkModule,
  ApiSdkModule,
  StorageSdkModule,
  HttpSdkModule,
} from '@lizuz/mini-app-types';
import type { RpcClient, RpcMiddleware } from '../rpc';
import type { RpcMetricsSnapshot } from '../observability';
import type { ChatSdkModule } from './chat.types';

/**
 * The full public shape of a `MiniAppSdk` instance — this is the contract
 * vendor mini apps code against: eight domain modules plus lifecycle,
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
  device: DeviceSdkModule;
  api: ApiSdkModule;
  http: HttpSdkModule;
  ai: ChatSdkModule;

  initialize(): Promise<void>;
  destroy(): void;
  on(event: string, handler: EventHandler): () => void;

  /** Publishes an event to the shell's internal event bus. Other shell components may listen. Mini-apps cannot subscribe to each other directly. */
  emit(event: string, data?: unknown): void;

  /** Registers a middleware wrapping every request made from this point forward. See `rpc/middleware.ts`. */
  use(middleware: RpcMiddleware): void;
  /** A point-in-time snapshot of request counts, timings, failures, timeouts, and retries. */
  getMetrics(): RpcMetricsSnapshot;
  /** Adds a module beyond the nine built-in ones, backed by the same `RpcClient` every built-in module uses. */
  registerModule<T>(name: string, factory: (rpc: RpcClient) => T): void;
  /** Retrieves a module registered via `registerModule()`, or any built-in module by its namespace name. */
  getModule<T>(name: string): T | undefined;
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
}
