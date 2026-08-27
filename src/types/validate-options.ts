import { SdkError } from "../errors";
import type { MiniAppSdkOptions } from "./sdk.types";

export function validateSdkOptions(options: MiniAppSdkOptions): void {
  if (!options || typeof options !== "object") {
    throw new SdkError({
      code: "INVALID_OPTIONS",
      message: "MiniAppSdkOptions must be an object",
      details: { received: String(options) },
    });
  }
  if (
    typeof options.miniAppId !== "string" ||
    options.miniAppId.trim().length === 0
  ) {
    throw new SdkError({
      code: "INVALID_OPTIONS",
      message: "miniAppId is required and must be a non-empty string",
      details: {
        miniAppId: (options as unknown as Record<string, unknown>).miniAppId,
      },
    });
  }
  const checkPositive = (
    name: keyof MiniAppSdkOptions,
    value: unknown,
    allowZero = false,
  ): void => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new SdkError({
        code: "INVALID_OPTIONS",
        message: `${String(name)} must be a finite number`,
        details: { [String(name)]: value },
      });
    }
    const min = allowZero ? 0 : 1;
    if (value < min) {
      throw new SdkError({
        code: "INVALID_OPTIONS",
        message: `${String(name)} must be >= ${min}`,
        details: { [String(name)]: value },
      });
    }
  };

  checkPositive("timeout", options.timeout);
  checkPositive("retryAttempts", options.retryAttempts, true);
  checkPositive("retryDelayMs", options.retryDelayMs, true);
  checkPositive("maxRetryDelayMs", options.maxRetryDelayMs, true);
  if (options.heartbeat !== undefined) {
    if (
      typeof options.heartbeat !== "object" ||
      options.heartbeat === null ||
      Array.isArray(options.heartbeat)
    ) {
      throw new SdkError({
        code: "INVALID_OPTIONS",
        message: "heartbeat must be an object",
        details: { heartbeat: options.heartbeat },
      });
    }
    const hb = options.heartbeat as Record<string, unknown>;
    for (const k of ["intervalMs", "timeoutMs", "maxMissedPongs"] as const) {
      const v = hb[k];
      if (
        v !== undefined &&
        (typeof v !== "number" || !Number.isFinite(v) || v < 1)
      ) {
        throw new SdkError({
          code: "INVALID_OPTIONS",
          message: `heartbeat.${k} must be a positive finite number`,
          details: { [k]: v },
        });
      }
    }
  }
  if (
    options.targetOrigin !== undefined &&
    typeof options.targetOrigin !== "string"
  ) {
    throw new SdkError({
      code: "INVALID_OPTIONS",
      message: "targetOrigin must be a string",
      details: { targetOrigin: options.targetOrigin },
    });
  }
  if (
    options.logLevel !== undefined &&
    !["debug", "info", "warn", "error"].includes(options.logLevel)
  ) {
    throw new SdkError({
      code: "INVALID_OPTIONS",
      message: "logLevel must be one of debug|info|warn|error",
      details: { logLevel: options.logLevel },
    });
  }
}
