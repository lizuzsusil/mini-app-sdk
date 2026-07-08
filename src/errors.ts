import type { PlatformError } from "./types";

export const ErrorCodes = {
  HANDSHAKE_TIMEOUT: "HANDSHAKE_TIMEOUT",
  TRANSPORT_STOPPED: "TRANSPORT_STOPPED",
  SDK_NOT_INITIALIZED: "SDK_NOT_INITIALIZED",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  REQUEST_FAILED: "REQUEST_FAILED",
  NO_WINDOW: "NO_WINDOW",
} as const;

export class SdkError extends Error {
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(error: PlatformError) {
    super(error.message);
    this.name = "SdkError";
    this.code = error.code;
    this.retryable = error.retryable ?? false;
    this.details = error.details;
  }
  static create(
    code: string,
    message: string,
    retryable = false,
    details?: Record<string, unknown>,
  ): SdkError {
    return new SdkError({
      code,
      message,
      retryable,
      details,
    });
  }
}
