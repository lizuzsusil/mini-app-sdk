import {PlatformTypeLiteral} from "./common.types";

export type DevicePermissionStatus =
    | "granted"
    | "denied"
    | "permanentlyDenied"
    | "restricted";

export interface DevicePermissionBaseResponse<T> {
    status: DevicePermissionStatus;
    data?: T;
    error?: string;
}

export interface DeviceLocationResult {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: Date | string;
}

export interface DeviceExtraOptions {
    reason?: string;
}

export interface FileModule {
    rawFile?: File;
    url: string;
    fileName?: string;
    mimeType?: string;
    extension?: string;
    byteSize?: number;
    previewUrl?: string;
}

export interface DeviceFileOptions extends DeviceExtraOptions {
    multiple?: boolean;
    accept?: string[];
}

export interface DeviceCameraResult {
    url: string;
    fileName?: string;
    mimeType?: string;
    byteSize?: number;
    rawFile?: File;
}

export interface DeviceGalleryResult {
    images: FileModule[];
}

export interface DeviceFileResult {
    file: FileModule[];
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

export interface DeviceSdkModule {
    camera(options?: DeviceExtraOptions): Promise<DevicePermissionBaseResponse<DeviceCameraResult>>;
    location(options?: DeviceExtraOptions): Promise<DevicePermissionBaseResponse<DeviceLocationResult>>;
    gallery(options?: DeviceFileOptions): Promise<DevicePermissionBaseResponse<DeviceGalleryResult>>;
    files(options?: DeviceFileOptions): Promise<DevicePermissionBaseResponse<DeviceFileResult>>;
    biometric(options?: DeviceBiometricOptions): Promise<DeviceBiometricResult>;
    notifications(options?: DeviceNotificationsOptions): Promise<DeviceNotificationResult>;
    network(): Promise<DeviceNetworkResult>;
    info(): Promise<DeviceInfoResult>;
}
 