import type { PlatformSdkModule, PlatformTypeLiteral } from '../types';

export interface PlatformModuleHandle {
  /** The public-facing module, satisfying `PlatformSdkModule` exactly — no extra methods. */
  module: PlatformSdkModule;
  /**
   * Internal setter used only by the composition root (`MiniAppSdk`) once
   * the actual platform type is known (fetched from the host during
   * `initialize()`). Not part of `PlatformSdkModule`, so it cannot be
   * called by consumer code even though it closes over the same state.
   */
  setType: (type: PlatformTypeLiteral) => void;
}

/**
 * `platform` holds one piece of local mutable state — `type` — which isn't
 * known until the host responds during `initialize()`, so it can't be
 * fetched fresh per call like the other modules do. That state lives
 * entirely inside this closure; nothing outside this file can change it
 * except through the `setType` handle returned alongside the module.
 */
export function createPlatformModule(initialType: PlatformTypeLiteral = 'WEB'): PlatformModuleHandle {
  let type: PlatformTypeLiteral = initialType;

  const module: PlatformSdkModule = {
    get type() {
      return type;
    },
    isWeb: () => type === 'WEB',
    isAndroid: () => type === 'ANDROID',
    isIOS: () => type === 'IOS',
    isMobile: () => type !== 'WEB',
  };

  return {
    module,
    setType: (newType: PlatformTypeLiteral) => {
      type = newType;
    },
  };
}
