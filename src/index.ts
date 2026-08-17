import { MiniAppSdk } from "./client";
import { SdkError } from "./errors";
import type { MiniAppSdkOptions } from "./types";

export type { MiniAppSdkDependencies } from "./client";
export { MiniAppSdk } from "./client";
export {
  CONNECTION_EVENTS,
  MESSAGE_CHANNEL,
  NAVIGATION_EVENTS,
  PLATFORM_EVENT_NAME,
  PROTOCOL_VERSION,
} from "./constants";
export type {
  RequestCancelledErrorOptions,
  SdkErrorCode,
  SdkErrorOptions,
} from "./errors";
export {
  RequestCancelledError,
  SdkError,
  StreamCancelledError,
} from "./errors";
export type { ConsoleLoggerOptions, Logger } from "./logging";
export { ConsoleLogger, NoopLogger } from "./logging";
export type { AppearanceModuleHandle, ModuleFactory } from "./modules";
export { ChatMessages } from "./modules";
export type {
  ActionMetrics,
  DurationPercentiles,
  RpcMetricsOptions,
  RpcMetricsSnapshot,
} from "./observability";
export type {
  MessageType,
  PlatformError,
  PlatformMessage,
} from "./protocol";
export type {
  RpcMiddleware,
  RpcMiddlewareContext,
  RpcNext,
  RpcRequestOptions,
  RpcStreamOptions,
} from "./rpc";
export { StreamBuilder } from "./stream";
export type { Transport, TransportDebugInfo } from "./transport";
export type {
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  AppearanceSdkModule,
  AppearanceState,
  AppearanceType,
  AuthSdkModule,
  ChatMessage,
  ChatRequestOptions,
  ChatSdkModule,
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
  Direction,
  EventHandler,
  FlagsSdkModule,
  Headers,
  HeartbeatOptions,
  HostDescriptor,
  HttpBodyRequest,
  HttpDeleteParams,
  HttpGetParams,
  HttpMethod,
  HttpPatchParams,
  HttpPostParams,
  HttpPutParams,
  HttpQueryRequest,
  HttpRequestBase,
  HttpResult,
  HttpSdkModule,
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
  OnEventOptions,
  PendingRequestInfo,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  PlatformTypeResponse,
  PlatformTypes,
  PlatformUser,
  Query,
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

/**
 * Module-scoped "active instance" used only by the `createMiniAppSdk` /
 * `getMiniAppSdk` / `initMiniAppSdk` convenience trio below, for
 * consumers who want a single implicit SDK instance instead of managing
 * their own reference. This is a small, explicit, single-purpose piece of
 * state — not a hidden global — and is entirely separate from the
 * `cdn.ts` multi-instance registry, which exists for a different
 * consumer (the `<script>`-tag/IIFE build) and is intentionally not
 * mixed with this one.
 */
let activeInstance: MiniAppSdk | null = null;

/** Constructs a `MiniAppSdk` without initializing it. Call `.initialize()` yourself. */
export function createMiniAppSdk(options: MiniAppSdkOptions): MiniAppSdk {
  return new MiniAppSdk(options);
}

/** Returns the instance created by the most recent `initMiniAppSdk()` call. */
export function getMiniAppSdk(): MiniAppSdk {
  if (!activeInstance) {
    throw new SdkError({
      code: "SDK_NOT_INITIALIZED",
      message: "Mini App SDK not initialized. Call initMiniAppSdk() first.",
    });
  }
  return activeInstance;
}

/** Constructs, initializes, and registers a `MiniAppSdk` as the active instance. */
export async function initMiniAppSdk(
  options: MiniAppSdkOptions,
): Promise<MiniAppSdk> {
  const sdk = new MiniAppSdk(options);
  await sdk.initialize();
  activeInstance = sdk;
  return sdk;
}
