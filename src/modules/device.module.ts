import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  DeviceBiometricOptions,
  DeviceBiometricResult,
  DeviceCameraResult,
  DeviceContactResult,
  DeviceExtraOptions,
  DeviceFileOptions,
  DeviceFileResult,
  DeviceGalleryResult,
  DeviceDownloadResult,
  DeviceInfoResult,
  DeviceLocationResult,
  DeviceNetworkResult,
  DeviceNotificationResult,
  DeviceNotificationsOptions,
  DevicePermissionBaseResponse,
  DeviceSdkModule,
  DeviceDownloadOptions
} from "../types";


export function createDeviceModule(rpc: RpcClient): DeviceSdkModule {
  return {
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
      rpc.request<DeviceBiometricResult>(
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
