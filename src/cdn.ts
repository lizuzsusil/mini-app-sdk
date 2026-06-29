import { MiniAppSdk } from './sdk';
import type { MiniAppSdkOptions } from './types';

const instances = new Map<string, MiniAppSdk>();

const registry = {
  createInstance(moduleId: string, options?: Partial<MiniAppSdkOptions>) {
    const existing = instances.get(moduleId);
    if (existing) {
      existing.destroy();
    }
    const sdk = new MiniAppSdk({ moduleId, ...options } as MiniAppSdkOptions);
    return sdk.initialize().then(() => {
      instances.set(moduleId, sdk);
      return sdk;
    });
  },

  getInstance(moduleId: string) {
    return instances.get(moduleId) ?? null;
  },

  destroyInstance(moduleId: string) {
    const sdk = instances.get(moduleId);
    if (sdk) {
      sdk.destroy();
      instances.delete(moduleId);
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
