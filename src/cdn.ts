import { MiniAppSdk } from './client';
import type { MiniAppSdkDependencies } from './client';
import type { MiniAppSdkOptions } from './types';
import { SDK_GLOBAL_KEY } from './constants';

/**
 * Global config the host shell sets on `window.__GSA_SDK__` before the CDN
 * `<script>` tag runs. Shape matches `MiniAppSdkOptions`: `miniAppId` is
 * required, everything else is optional tuning. The SDK overwrites this same
 * key with the live instance once constructed.
 */
export type CdnSdkConfig = MiniAppSdkOptions;

/** Reads the host-provided config from `window.__GSA_SDK__`. */
function resolveConfig(): MiniAppSdkOptions {
  const config = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY]
    : undefined;
  if (config && typeof config === 'object' && typeof (config as MiniAppSdkOptions).miniAppId === 'string') {
    return config as MiniAppSdkOptions;
  }
  throw new Error(
    `Mini App SDK: missing global config. Set window.${SDK_GLOBAL_KEY} = { miniAppId, ... } before loading the script.`,
  );
}

const opts = resolveConfig();
const deps: MiniAppSdkDependencies = {
  allowedOrigin: opts.targetOrigin,
};

/**
 * Single, page-wide MiniAppSdk instance. Constructing it overwrites
 * `window.__GSA_SDK__` (the pre-load config) with the instance; `destroy()`
 * removes it again.
 */
const sdk = new MiniAppSdk(opts, deps);
void sdk.initialize().catch((error) => {
  console.error(`Mini App SDK("${opts.miniAppId}") initialization failed`, error);
  sdk.destroy();
});
