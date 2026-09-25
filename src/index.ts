import { SewaPlatformSdk } from "./client";
import { SdkError } from "./errors";
import type { SewaPlatformSdkOptions } from "./types";

export type { SdkPlugin, SewaPlatformSdkDependencies } from "./client";
export { SewaPlatformSdk } from "./client";
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
export type { SseStreamEvent } from "./stream";
export { parseSseStream, StreamBuilder } from "./stream";
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
  ApiRequestMethod,
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  ApiUploadProgress,
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
  HeartbeatOptions,
  HostDescriptor,
  LinksOpenedEvent,
  LinksOpenOptions,
  LinksSdkModule,
  LocaleState,
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
  ReliabilityOptions,
  SdkDebug,
  SdkDebugSnapshot,
  SdkEventMap,
  SdkStatus,
  SewaPlatformSdkInterface,
  SewaPlatformSdkOptions,
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
  getInstance as getRegistryInstance,
  registerInstance as registerRegistryInstance,
} from "./client/instance-registry";

let activeInstance: SewaPlatformSdk | null = null;

/** Constructs a `SewaPlatformSdk` without initializing it. Call `.initialize()` yourself. */
export function createSewaPlatformSdk(
  options: SewaPlatformSdkOptions,
): SewaPlatformSdk {
  const sdk = new SewaPlatformSdk(options);
  registerRegistryInstance(sdk);
  activeInstance = sdk;
  return sdk;
}

export function getSewaPlatformSdk(): SewaPlatformSdk {
  if (activeInstance) return activeInstance;
  const fromRegistry = getRegistryInstance();
  if (fromRegistry) {
    activeInstance = fromRegistry;
    return fromRegistry;
  }
  throw new SdkError({
    code: "SDK_NOT_INITIALIZED",
    message: "Mini App SDK not initialized. Call initSewaPlatformSdk() first.",
  });
}

export async function initSewaPlatformSdk(
  options: SewaPlatformSdkOptions,
): Promise<SewaPlatformSdk> {
  const sdk = new SewaPlatformSdk(options);
  await sdk.initialize();
  registerRegistryInstance(sdk);
  activeInstance = sdk;
  return sdk;
}

export function getActiveInstance(): SewaPlatformSdk | null {
  return activeInstance ?? getRegistryInstance() ?? null;
}
