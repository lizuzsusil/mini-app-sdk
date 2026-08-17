import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  DeviceAction,
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
  DeviceSdkModuleWithGuards,
} from "../types";

/** Every action the device module can feature-detect. */
const DEVICE_ACTIONS: readonly DeviceAction[] = [
  "location",
  "camera",
  "gallery",
  "files",
  "download",
  "contact",
  "biometric",
  "notifications",
  "network",
  "info",
];

export function createDeviceModule(rpc: RpcClient): DeviceSdkModuleWithGuards {
  return {
    isSupported: (action: DeviceAction): boolean =>
      DEVICE_ACTIONS.includes(action) &&
      rpc.getCapabilities().includes(NAMESPACES.DEVICE),

    location: (options?: DeviceExtraOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceLocationResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.LOCATION,
        options,
      ),

    camera: (options?: DeviceExtraOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceCameraResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.CAMERA,
        options,
      ),

    gallery: (options?: DeviceFileOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceGalleryResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.GALLERY,
        options,
      ),

    files: (options?: DeviceFileOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceFileResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.FILES,
        options,
      ),

    download: (options?: DeviceDownloadOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceDownloadResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.DOWNLOAD,
        options,
      ),

    contact: (options?: DeviceExtraOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceContactResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.CONTACT,
        options,
      ),

    biometric: (options?: DeviceBiometricOptions) =>
      rpc.request<DevicePermissionBaseResponse<DeviceBiometricResult>>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.BIOMETRIC,
        options,
      ),

    notifications: (options?: DeviceNotificationsOptions) =>
      rpc.request<DeviceNotificationResult>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.NOTIFICATIONS,
        options,
      ),

    network: () =>
      rpc.request<DeviceNetworkResult>(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.NETWORK,
      ),

    info: () =>
      rpc.request<DeviceInfoResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.INFO),
  };
}
