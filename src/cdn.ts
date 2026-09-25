import type { SewaPlatformSdkDependencies } from "./client";
import { SewaPlatformSdk } from "./client";
import { SDK_GLOBAL_KEY } from "./constants";
import type { SewaPlatformSdkOptions } from "./types";

export type CdnSdkConfig = SewaPlatformSdkOptions;

function resolveConfig(): SewaPlatformSdkOptions {
  const config =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)[SDK_GLOBAL_KEY]
      : undefined;
  if (
    config &&
    typeof config === "object" &&
    typeof (config as SewaPlatformSdkOptions).miniAppId === "string"
  ) {
    return config as SewaPlatformSdkOptions;
  }
  throw new Error(
    `Sewa SDK: missing global config. Set window.${SDK_GLOBAL_KEY} = { miniAppId, ... } before loading the script.`,
  );
}

const opts = resolveConfig();
const deps: SewaPlatformSdkDependencies = {
  allowedOrigin: opts.targetOrigin,
};

const sdk = new SewaPlatformSdk(opts, deps);
void sdk.initialize().catch((error) => {
  console.error(`Sewa SDK("${opts.miniAppId}") initialization failed`, error);
  sdk.destroy();
});
