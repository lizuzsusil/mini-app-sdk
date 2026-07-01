import { MiniAppSdk } from './sdk';
import type { MiniAppSdkOptions } from './types';

const instances = new Map<string, MiniAppSdk>();
let activeModuleId: string | null = null;

const registry = {
  createInstance(moduleId: string, options?: Partial<MiniAppSdkOptions>) {
    const existing = instances.get(moduleId);
    if (existing) {
      existing.destroy();
    }
    const sdk = new MiniAppSdk({ moduleId, ...options } as MiniAppSdkOptions);
    return sdk.initialize().then(() => {
      instances.set(moduleId, sdk);
      activeModuleId = moduleId;
      return sdk;
    });
  },

  getInstance(moduleId: string) {
    return instances.get(moduleId) ?? null;
  },

  /**
   * Get the most recently created SDK instance.
   * Mini apps call this as mini apps are completely unaware of their own module identity.
   */
  getActiveInstance() {
    return activeModuleId ? (instances.get(activeModuleId) ?? null) : null;
  },

  destroyInstance(moduleId: string) {
    const sdk = instances.get(moduleId);
    if (sdk) {
      sdk.destroy();
      instances.delete(moduleId);
      if (activeModuleId === moduleId) {
        const remainingKeys = Array.from(instances.keys());
        activeModuleId = remainingKeys[remainingKeys.length - 1] ?? null;
      }
    }
  },

  hasInstance(moduleId: string) {
    return instances.has(moduleId);
  },

  getActiveModuleIds() {
    return Array.from(instances.keys());
  },
};

if (typeof window !== 'undefined') {
  (window as any).getMiniAppBridge = () => registry;
}
