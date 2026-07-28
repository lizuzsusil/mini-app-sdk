import { MiniAppSdk } from './client';
import type { MiniAppSdkDependencies } from './client';
import type { CreateInstanceOptions, MiniAppSdkOptions } from './types';

/** Map of moduleId to MiniAppSdk instances */
const instances = new Map<string, MiniAppSdk>();

/** Tracks the moduleId of the most recently created SDK instance */
let activeModuleId: string | null = null;

/**
 * Global registry for managing MiniAppSdk lifecycle across a page.
 * Exposed on window as `getMiniAppBridge` when running in a browser.
 */
const registry = {
  /**
   * Creates and initializes a new MiniAppSdk for the given module.
   * If an instance already exists for the same moduleId it is destroyed first.
   * On success the new instance is stored and set as the active instance.
   *
   * @param moduleId  - Unique identifier for the mini-app module
   * @param _channel  - (reserved) Communication channel hint
   * @param sdkOptions - Optional configuration overrides (timeout, retry, targetOrigin)
   * @returns The initialized MiniAppSdk instance
   */
  async createInstance({
    moduleId,
    channel: _channel,
    sdkOptions,
  }: CreateInstanceOptions) {
    const existing = instances.get(moduleId);

    if (existing) {
      existing.destroy();
      instances.delete(moduleId);
    }

    const opts: MiniAppSdkOptions = {
      moduleId,
      timeout: sdkOptions?.timeout,
      retryAttempts: sdkOptions?.retryAttempts,
      retryDelayMs: sdkOptions?.retryDelayMs,
      maxRetryDelayMs: sdkOptions?.maxRetryDelayMs,
    };
    const deps: MiniAppSdkDependencies = {
      allowedOrigin: sdkOptions?.targetOrigin,
    };

    const sdk = new MiniAppSdk(opts, deps);

    try {
      await sdk.initialize();

      instances.set(moduleId, sdk);
      activeModuleId = moduleId;

      return sdk;
    } catch (error) {
      sdk.destroy();
      throw error;
    }
  },

  /**
   * Returns the currently active MiniAppSdk instance, or null if none exists.
   * The active instance is the one most recently created via createInstance.
   */
  getActiveInstance() {
    return activeModuleId ? (instances.get(activeModuleId) ?? null) : null;
  },

  /**
   * Destroys the MiniAppSdk instance for the given moduleId and removes it
   * from the registry. If the destroyed instance was the active one, the
   * most recently created remaining instance becomes active.
   *
   * @param moduleId - The module whose instance should be destroyed
   */
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
};

/** Expose the registry globally so that parent frames / host apps can interact with it */
if (typeof window !== 'undefined') {
  (window as unknown as { getMiniAppBridge: () => typeof registry }).getMiniAppBridge = () => registry;
}
