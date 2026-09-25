/** biome-ignore-all lint/suspicious/noExplicitAny: <any type> */

import type {
  SewaPlatformSdkInterface as NpmSewaPlatformSdkInterface,
  RpcRequestOptions,
} from "sewa-platform-types";
import type { ApiSdkModule } from "./api.types";

export type {
  AdaptiveTimeoutOptions,
  CircuitBreakerOptions,
  Diagnostic,
  DiagnosticSeverity,
  HeartbeatOptions,
  HostDescriptor,
  PendingRequestInfo,
  ReliabilityOptions,
  SdkDebug,
  SdkDebugSnapshot,
  SdkStatus,
  SewaPlatformSdkOptions,
} from "sewa-platform-types";

export interface SewaPlatformSdkInterface
  extends Omit<
    NpmSewaPlatformSdkInterface,
    "api" | "http" | "gicChat" | "usePlugin" | "request"
  > {
  api: ApiSdkModule;
  usePlugin(plugin: SdkPlugin): Promise<void>;
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
    sdk: SewaPlatformSdkInterface;
    rpc: any;
    logger: any;
  }): void | Promise<void>;
  onInitialize?(): Promise<void>;
  onDestroy?(): void;
}
