/**
 * Re-export shared core types from the single source `@lizuz/mini-app-types`.
 * Local file kept for backward imports (`src/types/common.types`) but no
 * longer owns the definitions — keeps SDK and host in sync.
 */
export type {
  AppearanceType,
  Diagnostic,
  DiagnosticSeverity,
  EventHandler,
  HeartbeatOptions,
  HostDescriptor,
  OnEventOptions,
  PendingRequestInfo,
  PlatformTypeLiteral,
  PlatformTypeResponse,
  PlatformTypes,
  RpcRequestOptions,
  RpcStreamOptions,
  SdkDebug,
  SdkDebugSnapshot,
  SdkEventMap,
  SdkStatus,
  Transport,
  TransportDebugInfo,
} from "@lizuz/mini-app-types";
