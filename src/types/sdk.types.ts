/**
 * Re-export shared SDK surface types from the single source `@lizuz/mini-app-types`.
 * Local extensions that depend on SDK internals (RpcClient, Transport) are kept
 * here but shared shapes live in the package.
 */
export type {
  AdaptiveTimeoutOptions,
  CircuitBreakerOptions,
  Diagnostic,
  DiagnosticSeverity,
  GicChatEvent,
  GicChatSdkModule,
  GicChatSession,
  GicChatStreamOptions,
  GicChatStreamRequest,
  HeartbeatOptions,
  HostDescriptor,
  MiniAppSdkInterface,
  MiniAppSdkOptions,
  PendingRequestInfo,
  ReliabilityOptions,
  SdkDebug,
  SdkDebugSnapshot,
  SdkPlugin,
  SdkStatus,
} from "@lizuz/mini-app-types";
