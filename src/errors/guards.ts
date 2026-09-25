import { HandshakeError } from "./handshake-error";
import { SdkError } from "./sdk-error";
import { TimeoutError } from "./timeout-error";
import { TransportError } from "./transport-error";

export function isSdkError(error: unknown): error is SdkError {
  return error instanceof SdkError;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof SdkError) return error.retryable;
  if (
    error !== null &&
    typeof error === "object" &&
    "retryable" in error &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  ) {
    return Boolean((error as { retryable: boolean }).retryable);
  }
  return false;
}

export function isTimeout(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

export function isTransportError(error: unknown): error is TransportError {
  return error instanceof TransportError;
}

export function isHandshakeError(error: unknown): error is HandshakeError {
  return error instanceof HandshakeError;
}

export function isAuthError(error: unknown): boolean {
  if (error instanceof SdkError) {
    return (
      error.code === "AUTH_FAILED" ||
      error.code === "AUTH_REQUIRED" ||
      error.code === "UNAUTHENTICATED" ||
      error.code === "FORBIDDEN"
    );
  }
  return false;
}

export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof SdkError) return error.code;
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}
