import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type {
  DeviceBiometricOptions,
  DeviceBiometricResult,
  DeviceCameraOptions,
  DeviceCameraResult,
  DeviceFilesOptions,
  DeviceFilesResult,
  DeviceGalleryOptions,
  DeviceGalleryResult,
  DeviceInfoResult,
  DeviceLocationOptions,
  DeviceLocationResult,
  DeviceNetworkResult,
  DeviceNotificationResult,
  DeviceNotificationsOptions,
  DeviceSdkModule,
} from '../types';

export function createDeviceModule(rpc: RpcClient): DeviceSdkModule {
  return {
    location: (options?: DeviceLocationOptions) => rpc.request<DeviceLocationResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION, options),
    camera: (options?: DeviceCameraOptions) => rpc.request<DeviceCameraResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.CAMERA, options),
    gallery: (options?: DeviceGalleryOptions) => rpc.request<DeviceGalleryResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.GALLERY, options),
    files: (options?: DeviceFilesOptions) => rpc.request<DeviceFilesResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.FILES, options),
    biometric: (options?: DeviceBiometricOptions) => rpc.request<DeviceBiometricResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.BIOMETRIC, options),
    notifications: (options?: DeviceNotificationsOptions) =>
      rpc.request<DeviceNotificationResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.NOTIFICATIONS, options),
    network: () => rpc.request<DeviceNetworkResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.NETWORK),
    info: () => rpc.request<DeviceInfoResult>(NAMESPACES.DEVICE, ACTIONS.DEVICE.INFO),
  };
}
