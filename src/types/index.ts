/**
 * `@lizuz/mini-app-types` spells this one `…SkdModule`. Re-exported under
 * the corrected name so nothing in this SDK — or in a mini app consuming
 * it — has to repeat the typo; the original spelling is kept alongside so
 * code already written against the types package still compiles.
 */
export type {
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  AppearanceSdkModule,
  AppearanceState,
  AuthSdkModule,
  ChatMessage,
  ConfigSdkModule,
  DeviceBiometricOptions,
  DeviceBiometricResult,
  DeviceCameraResult,
  DeviceContactResult,
  DeviceDownloadOptions,
  DeviceDownloadResult,
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
  Direction,
  EventHandler,
  FlagsSdkModule,
  HostDescriptor,
  HttpMethod,
  LocaleState,
  ModelCompletionOptions,
  NavigationRouterResult,
  NavigationRouterSkdModule as NavigationRouterSdkModule,
  NavigationRouterSkdModule,
  NavigationSdkModule,
  NavigationState,
  NavigationTarget,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  PlatformUser,
  StreamChunk,
  StreamError,
  ThemeMode,
  ThemePreference,
  ThemeState,
} from "@lizuz/mini-app-types";
export type { ChatRequestOptions, ChatSdkModule } from "./chat.types";
export type {
  AppearanceType,
  OnEventOptions,
  PlatformTypeResponse,
  PlatformTypes,
  SdkEventMap,
} from "./common.types";
export type {
  DeviceAction,
  DeviceSdkModuleWithGuards,
} from "./device.types";
export type {
  Headers,
  HttpBodyRequest,
  HttpDeleteParams,
  HttpGetParams,
  HttpPatchParams,
  HttpPostParams,
  HttpProgress,
  HttpPutParams,
  HttpQueryRequest,
  HttpRequestBase,
  HttpResult,
  HttpSdkModule,
  HttpUploadOptions,
  Query,
} from "./http.types";
export type {
  LinksOpenedEvent,
  LinksOpenOptions,
  LinksSdkModule,
} from "./links.types";
export type {
  NotificationOpenEvent,
  NotificationsRegisterOptions,
  NotificationsRegisterResult,
  NotificationsSdkModule,
} from "./notifications.types";
export type {
  HeartbeatOptions,
  MiniAppSdkInterface,
  MiniAppSdkOptions,
  PendingRequestInfo,
  SdkDebug,
  SdkDebugSnapshot,
  SdkStatus,
} from "./sdk.types";
export type {
  StorageSdkModule,
  StorageSetOptions,
} from "./storage.types";
