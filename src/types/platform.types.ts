import type { PlatformTypeLiteral } from "./common.types";

/**
 * Static descriptor injected by the shell before the mini-app mounts.
 * Provides the mini-app with environment metadata — which shell is hosting
 * it, what version of the shell, what capabilities are available, and which
 * SDK version was injected.
 *
 * Set on the global as `window.__GSA_HOST_DESCRIPTOR__` by the shell.
 */
export interface HostDescriptor {
  /** The host shell type: `flutter` (mobile WebView) or `web` (Next.js). */
  type: "flutter" | "web";
  /** Semver string of the shell release. */
  version: string;
  /** Capability strings the shell supports, e.g. `["storage", "api", "gps", "camera"]`. */
  capabilities: string[];
  /** The Mini-App SDK version being injected. */
  sdkVersion: string;
}

export interface PlatformSdkModule {
  readonly type: PlatformTypeLiteral;
  isWeb(): boolean;
  isFlutter(): boolean;
  isMobile(): boolean;
}
