import { MiniAppSdk } from './client';
import type { MiniAppSdkDependencies } from './client';
import type { CreateInstanceOptions, MiniAppSdkOptions } from './types';

/** Map of miniAppId to MiniAppSdk instances */
const instances = new Map<string, MiniAppSdk>();

/**
 * Global registry for managing MiniAppSdk lifecycle across a page.
 * Exposed on window as `getMiniAppBridge` when running in a browser.
 */
const registry = {
  /**
   * Creates and initializes a new MiniAppSdk for the given module.
   * If an instance already exists for the same miniAppId it is destroyed first.
   * On success the new instance is stored and set as the active instance.
   *
   * @param miniAppId  - Unique identifier for the mini-app module
   * @param _channel  - (reserved) Communication channel hint
   * @param sdkOptions - Optional configuration overrides (timeout, retry, targetOrigin)
   * @returns The initialized MiniAppSdk instance
   */
  async createInstance({
    miniAppId,
    channel: _channel,
    sdkOptions,
  }: CreateInstanceOptions) {
    const existing = instances.get(miniAppId);

    if (existing) {
      existing.destroy();
      instances.delete(miniAppId);
    }

    const opts: MiniAppSdkOptions = {
      miniAppId,
      registerGlobal: true,
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

      instances.set(miniAppId, sdk);

      return sdk;
    } catch (error) {
      sdk.destroy();
      throw error;
    }
  },

  destroyInstance(miniAppId: string) {
    const sdk = instances.get(miniAppId);
    if (sdk) {
      sdk.destroy();
      instances.delete(miniAppId);
    }
  },
};

/** Expose the registry globally so that parent frames / host apps can interact with it */
if (typeof window !== 'undefined') {
  (window as unknown as { getMiniAppBridge: () => typeof registry }).getMiniAppBridge = () => registry;
}
