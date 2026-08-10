export type {
  PlatformTypeLiteral,
  EventHandler,
  HostDescriptor,
} from '@lizuz/mini-app-types';

export type {
  PlatformUser,
  AuthSdkModule,
  PermissionsSdkModule,
} from '@lizuz/mini-app-types';

export type {
  FlagsSdkModule,
  ConfigSdkModule,
} from '@lizuz/mini-app-types';

export type {
  NavigationTarget,
  NavigationState,
  NavigationSdkModule,
  NavigationRouterResult,
} from '@lizuz/mini-app-types';

/**
 * `@lizuz/mini-app-types` spells this one `…SkdModule`. Re-exported under
 * the corrected name so nothing in this SDK — or in a mini app consuming
 * it — has to repeat the typo; the original spelling is kept alongside so
 * code already written against the types package still compiles.
 */
export type {
  NavigationRouterSkdModule as NavigationRouterSdkModule,
  NavigationRouterSkdModule,
} from '@lizuz/mini-app-types';

export type {
  PlatformSdkModule,
} from '@lizuz/mini-app-types';

export type {
  StorageSdkModule,
} from '@lizuz/mini-app-types';

export type {ChatMessage, ModelCompletionOptions, StreamChunk, StreamError} from '@lizuz/mini-app-types'

export type { ChatSdkModule } from './chat.types';

export type {
  DevicePermissionStatus,
  DeviceCameraResult,
  DevicePermissionBaseResponse,
  DeviceGalleryResult,
  DeviceInfoResult,
  DeviceFileResult,
  DeviceFileOptions,
  DeviceDownloadResult,
  DeviceExtraOptions,
  DeviceNetworkResult,
  DeviceNotificationResult,
  DeviceNotificationsOptions,
  DeviceBiometricResult,
  DeviceLocationResult,
  DeviceDownloadOptions,
  DeviceBiometricOptions,
  DeviceContactResult,
  DeviceSdkModule,
} from '@lizuz/mini-app-types';

export type {
  HttpGetParams,
  HttpPostParams,
  HttpPutParams,
  HttpPatchParams,
  HttpDeleteParams,
} from './http.types';

export type {
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  HttpMethod,
} from '@lizuz/mini-app-types';

export type { HttpResult, HttpSdkModule } from '@lizuz/mini-app-types';
export type { MiniAppSdkInterface, MiniAppSdkOptions } from './sdk.types';

export type {
  Direction,
  ThemePreference,
  ThemeMode,
  LocaleState,
  ThemeState,
  AppearanceState,
  AppearanceSdkModule,
} from '@lizuz/mini-app-types';
