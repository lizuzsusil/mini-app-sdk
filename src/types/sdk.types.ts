/**
 * Re-export shared SDK surface types from the single source `@lizuz/mini-app-types`.
 * Local extensions that depend on SDK internals (RpcClient, Transport) are kept
 * here but shared shapes live in the package.
 */
import type {
  MiniAppSdkInterface as NpmMiniAppSdkInterface,
  RpcRequestOptions,
} from "@lizuz/mini-app-types";
import type { ApiRequestParams, ApiResult, ApiSdkModule } from "./api.types";

export type {
  AdaptiveTimeoutOptions,
  CircuitBreakerOptions,
  Diagnostic,
  DiagnosticSeverity,
  HeartbeatOptions,
  HostDescriptor,
  MiniAppSdkOptions,
  PendingRequestInfo,
  ReliabilityOptions,
  SdkDebug,
  SdkDebugSnapshot,
  SdkStatus,
} from "@lizuz/mini-app-types";

/**
 * Local SDK surface — generic `api.request` (unary by default,
 * `stream: true` for chat/file streaming) is the only network module.
 * Backend-specific chat modules live in their mini apps, not in the SDK.
 */
export interface MiniAppSdkInterface
  extends Omit<
    NpmMiniAppSdkInterface,
    "api" | "http" | "gicChat" | "usePlugin" | "request"
  > {
  api: ApiSdkModule;
  usePlugin(plugin: SdkPlugin): Promise<void>;
  /**
   * Generic request shorthand — `sdk.request("POST", { ... })` delegates to
   * the `api` module (unary by default, `stream: true` for live streams).
   * `sdk.api.request(...)` remains as an equivalent alias.
   */
  request<T = unknown, B = unknown>(
    method: string,
    params: ApiRequestParams<B> & { stream: true },
  ): Promise<T>;
  request<T = unknown, B = unknown>(
    method?: string,
    params?: ApiRequestParams<B>,
  ): Promise<ApiResult<T>>;
  /** Raw RPC — `request(namespace, action, payload?, options?)`. */
  request<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<T>;
}

export interface SdkPlugin {
  name: string;
  install(ctx: {
    sdk: MiniAppSdkInterface;
    // biome-ignore lint/suspicious/noExplicitAny: mirrors the shared plugin contract (rpc/logger are host-provided)
    rpc: any;
    // biome-ignore lint/suspicious/noExplicitAny: mirrors the shared plugin contract (rpc/logger are host-provided)
    logger: any;
  }): void | Promise<void>;
  onInitialize?(): Promise<void>;
  onDestroy?(): void;
}
