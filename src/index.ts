import { MiniAppSdk } from "./client";
import { SdkError } from "./errors";
import type { MiniAppSdkOptions } from "./types";

export type { MiniAppSdkDependencies, SdkPlugin } from "./client";
export { MiniAppSdk } from "./client";
export {
  clearInstances,
  getAllInstances,
  getInstance,
  registerInstance,
  unregisterInstance,
} from "./client/instance-registry";
export {
  CONNECTION_EVENTS,
  HTTP_EVENTS,
  LINKS_EVENTS,
  MESSAGE_CHANNEL,
  NAVIGATION_EVENTS,
  NOTIFICATIONS_EVENTS,
  PLATFORM_EVENT_NAME,
  PROTOCOL_VERSION,
} from "./constants";
export type {
  RequestCancelledErrorOptions,
  SdkErrorCode,
  SdkErrorOptions,
} from "./errors";
export {
  getErrorCode,
  HandshakeError,
  HttpClientError,
  HttpServerError,
  isAuthError,
  isHandshakeError,
  isRetryable,
  isSdkError,
  isTimeout,
  isTransportError,
  ProtocolError,
  RequestCancelledError,
  SdkError,
  StreamCancelledError,
  TimeoutError,
  TransportError,
} from "./errors";
export type { ConsoleLoggerOptions, Logger } from "./logging";
export { ConsoleLogger, NoopLogger } from "./logging";
export type { AppearanceModuleHandle, ModuleFactory } from "./modules";
export type {
  ActionMetrics,
  DurationPercentiles,
  RpcMetricsOptions,
  RpcMetricsSnapshot,
  Span,
  Tracer,
} from "./observability";
export { NoopSpan, noopTracer } from "./observability";
export type { OfflineQueueOptions } from "./offline/offline-queue";
export { createOfflineQueuePlugin } from "./offline/offline-queue";
export type {
  MessageType,
  PlatformError,
  PlatformMessage,
} from "./protocol";
export { AdaptiveTimeout } from "./reliability/adaptive-timeout";
export { CircuitBreaker } from "./reliability/circuit-breaker";
export type {
  RpcMiddleware,
  RpcMiddlewareContext,
  RpcNext,
  RpcRequestOptions,
  RpcStreamOptions,
} from "./rpc";
export { StreamBuilder } from "./stream";
export type {
  Transport,
  TransportDebugInfo,
  WebSocketTransportOptions,
} from "./transport";
export {
  BroadcastTransport,
  DefaultTransport,
  MessagePortTransport,
  SsrTransport,
  WebSocketTransport,
} from "./transport";
export type {
  AdaptiveTimeoutOptions,
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  AppearanceSdkModule,
  AppearanceState,
  AppearanceType,
  AuthSdkModule,
  ChatMessage,
  ChatRequestOptions,
  CircuitBreakerOptions,
  ConfigSdkModule,
  DeviceAction,
  DeviceBiometricOptions,
  DeviceBiometricResult,
  DeviceCameraResult,
  DeviceExtraOptions,
  DeviceFileOptions,
  DeviceFileResult,
  DeviceGalleryResult,
  DeviceInfoResult,
  DeviceLocationResult,
  DeviceNetworkResult,
  DeviceNotificationResult,
  DeviceNotificationsOptions,
  DevicePermissionBaseResponse,
  DevicePermissionStatus,
  DeviceSdkModule,
  DeviceSdkModuleWithGuards,
  Diagnostic,
  DiagnosticSeverity,
  Direction,
  EventHandler,
  FlagsSdkModule,
  GicChatEvent,
  GicChatSdkModule,
  GicChatSession,
  GicChatStreamOptions,
  GicChatStreamRequest,
  Headers,
  HeartbeatOptions,
  HostDescriptor,
  HttpBodyRequest,
  HttpDeleteParams,
  HttpGetParams,
  HttpMethod,
  HttpPatchParams,
  HttpPostParams,
  HttpProgress,
  HttpPutParams,
  HttpQueryRequest,
  HttpRequestBase,
  HttpResult,
  HttpSdkModule,
  HttpUploadOptions,
  LinksOpenedEvent,
  LinksOpenOptions,
  LinksSdkModule,
  LocaleState,
  MiniAppSdkInterface,
  MiniAppSdkOptions,
  ModelCompletionOptions,
  NavigationRouterResult,
  NavigationRouterSdkModule,
  NavigationRouterSkdModule,
  NavigationSdkModule,
  NavigationState,
  NavigationTarget,
  NotificationOpenEvent,
  NotificationsRegisterOptions,
  NotificationsRegisterResult,
  NotificationsSdkModule,
  OnEventOptions,
  PendingRequestInfo,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  PlatformTypeResponse,
  PlatformTypes,
  PlatformUser,
  Query,
  ReliabilityOptions,
  SdkDebug,
  SdkDebugSnapshot,
  SdkEventMap,
  SdkStatus,
  StorageSdkModule,
  StorageSetOptions,
  StreamChunk,
  StreamError,
  ThemeMode,
  ThemePreference,
  ThemeState,
} from "./types";
export { validateSdkOptions } from "./types/validate-options";

import {
  getActiveInstance as getRegistryActiveInstance,
  getInstance as getRegistryInstance,
  registerInstance as registerRegistryInstance,
  setActiveInstance,
} from "./client/instance-registry";

/** Constructs a `MiniAppSdk` without initializing it. Call `.initialize()` yourself. */
export function createMiniAppSdk(options: MiniAppSdkOptions): MiniAppSdk {
  const sdk = new MiniAppSdk(options);
  // Register eagerly so `MiniAppSdk.getInstance()` and `window.__GSA_SDK__`
  // reflect the instance even before `initialize()` (mirrors CDN behavior).
  registerRegistryInstance(sdk);
  setActiveInstance(sdk);
  return sdk;
}

/** Returns the instance created by the most recent `initMiniAppSdk()` call. */
export function getMiniAppSdk(): MiniAppSdk {
  const active = getRegistryActiveInstance();
  if (active) return active;
  const fromRegistry = getRegistryInstance();
  if (fromRegistry) {
    setActiveInstance(fromRegistry);
    return fromRegistry;
  }
  throw new SdkError({
    code: "SDK_NOT_INITIALIZED",
    message: "Mini App SDK not initialized. Call initMiniAppSdk() first.",
  });
}

/** Constructs, initializes, and registers a `MiniAppSdk` as the active instance. */
export async function initMiniAppSdk(
  options: MiniAppSdkOptions,
): Promise<MiniAppSdk> {
  const sdk = new MiniAppSdk(options);
  await sdk.initialize();
  registerRegistryInstance(sdk);
  setActiveInstance(sdk);
  return sdk;
}

/**
 * Prefer `MiniAppSdk.getInstance()` for new code. Kept for backward
 * compatibility with existing consumers reading the module-scoped helper.
 * @deprecated Use `MiniAppSdk.getInstance()` or `getInstance()` from `instance-registry`.
 */
export function getActiveInstance(): MiniAppSdk | null {
  return getRegistryActiveInstance();
}
