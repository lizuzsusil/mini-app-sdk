import type { DeviceSdkModule } from "@lizuz/mini-app-types";

/**
 * The device actions a mini app can feature-detect with `isSupported`. The
 * host protocol today is namespace-granular — every action lives under the
 * `device` namespace — so this union exists for typo-safety and future
 * per-action capability reporting, not because the host differentiates them.
 */
export type DeviceAction =
  | "location"
  | "camera"
  | "gallery"
  | "files"
  | "download"
  | "contact"
  | "biometric"
  | "notifications"
  | "network"
  | "info";

/**
 * The device module, plus a `isSupported` feature-detect guard. Mini apps
 * branch on `sdk.device.isSupported("biometric")` instead of discovering a
 * missing capability at request-time via a `ProtocolError`.
 */
export interface DeviceSdkModuleWithGuards extends DeviceSdkModule {
  /**
   * Whether the host negotiated the `device` namespace during the handshake.
   * Returns `false` before `sdk.initialize()` resolves (capabilities aren't
   * known yet). Because the protocol advertises capabilities at namespace
   * granularity, a supported action means "the namespace exists", not that a
   * specific action is implemented — the host may still reject an individual
   * call.
   */
  isSupported(action: DeviceAction): boolean;
}
