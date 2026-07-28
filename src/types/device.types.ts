import type { PlatformTypeLiteral } from './common.types';

/**
 * Every device option interface below keeps an index signature
 * (`[key: string]: unknown`) alongside its named, typed fields. The named
 * fields give autocomplete and type-checking for the options a mini app
 * developer is actually likely to set; the index signature is a deliberate
 * escape hatch so a host can add a new, not-yet-documented option without
 * every caller's object literal failing to type-check.
 */

export interface DeviceLocationOptions {
  highAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
  [key: string]: unknown;
}

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface DeviceCameraOptions {
  quality?: number;
  allowEditing?: boolean;
  includeBase64?: boolean;
  [key: string]: unknown;
}

export interface DeviceCameraResult {
  uri: string;
  base64?: string;
  width?: number;
  height?: number;
}

export interface DeviceGalleryOptions {
  multiple?: boolean;
  maxItems?: number;
  mediaType?: 'image' | 'video' | 'all';
  [key: string]: unknown;
}

export interface DeviceGalleryResult {
  uris: string[];
}

export interface DeviceFilesOptions {
  multiple?: boolean;
  accept?: string[];
  [key: string]: unknown;
}

export interface DeviceFilesResult {
  uris: string[];
  names: string[];
}

export interface DeviceBiometricOptions {
  reason?: string;
  [key: string]: unknown;
}

export interface DeviceBiometricResult {
  success: boolean;
  error?: string;
}

export interface DeviceNotificationsOptions {
  requestPermission?: boolean;
  [key: string]: unknown;
}

export interface DeviceNotificationResult {
  enabled: boolean;
  token?: string;
}

export interface DeviceNetworkResult {
  online: boolean;
  type?: 'wifi' | 'cellular' | 'none';
  effectiveType?: string;
}

export interface DeviceInfoResult {
  platform: PlatformTypeLiteral;
  osVersion: string;
  appVersion: string;
  deviceModel?: string;
  screenWidth?: number;
  screenHeight?: number;
}

export interface DeviceStorageModule {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface DeviceSdkModule {
  location(options?: DeviceLocationOptions): Promise<DeviceLocationResult>;
  camera(options?: DeviceCameraOptions): Promise<DeviceCameraResult>;
  gallery(options?: DeviceGalleryOptions): Promise<DeviceGalleryResult>;
  files(options?: DeviceFilesOptions): Promise<DeviceFilesResult>;
  biometric(options?: DeviceBiometricOptions): Promise<DeviceBiometricResult>;
  notifications(options?: DeviceNotificationsOptions): Promise<DeviceNotificationResult>;
  network(): Promise<DeviceNetworkResult>;
  storage: DeviceStorageModule;
  info(): Promise<DeviceInfoResult>;
}
