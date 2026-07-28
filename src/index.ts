import { MiniAppSdk } from './client';
import type { MiniAppSdkOptions } from './types';
import { SdkError } from './errors';

export { MiniAppSdk } from './client';

export {
  PROTOCOL_VERSION,
  PLATFORM_EVENT_NAME,
  MESSAGE_CHANNEL,
} from './constants';

export type {
  PlatformUser,
  AuthSdkModule,
  PermissionsSdkModule,
  FlagsSdkModule,
  ConfigSdkModule,
  NavigationSdkModule,
  NavigationTarget,
  NavigationState,
  PlatformSdkModule,
  PlatformTypeLiteral,
  DeviceSdkModule,
  DeviceLocationOptions,
  DeviceLocationResult,
  DeviceCameraOptions,
  DeviceCameraResult,
  DeviceGalleryOptions,
  DeviceGalleryResult,
  DeviceFilesOptions,
  DeviceFilesResult,
  DeviceBiometricOptions,
  DeviceBiometricResult,
  DeviceNotificationsOptions,
  DeviceNotificationResult,
  DeviceNetworkResult,
  DeviceInfoResult,
  HttpSdkModule,
  HttpGetParams,
  HttpPostParams,
  HttpPutParams,
  HttpPatchParams,
  HttpDeleteParams,
  HttpResult,
  MiniAppSdkInterface,
  MiniAppSdkOptions,
  EventHandler,
} from './types';

export { SdkError } from './errors';
export type { SdkErrorCode } from './errors';

export type { Logger } from './logging';
export { ConsoleLogger, NoopLogger } from './logging';
export type { ConsoleLoggerOptions } from './logging';

export type { RpcMiddleware, RpcMiddlewareContext, RpcNext } from './rpc';

export type { RpcMetricsSnapshot, ActionMetrics } from './observability';

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
      code: 'SDK_NOT_INITIALIZED',
      message: 'Mini App SDK not initialized. Call initMiniAppSdk() first.',
    });
  }
  return activeInstance;
}

/** Constructs, initializes, and registers a `MiniAppSdk` as the active instance. */
export async function initMiniAppSdk(options: MiniAppSdkOptions): Promise<MiniAppSdk> {
  const sdk = new MiniAppSdk(options);
  await sdk.initialize();
  activeInstance = sdk;
  return sdk;
}
