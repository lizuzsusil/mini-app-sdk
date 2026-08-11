/**
 * Exhaustive union of machine-readable error codes the SDK itself can
 * raise. Host-originated errors (returned inside a `response` message's
 * `error.code`) are host-defined strings and are preserved as-is on
 * `ProtocolError`/`SdkError.code` even if they don't appear in this union —
 * this union only constrains codes the SDK *generates*.
 */
export type SdkErrorCode =
  | "TIMEOUT"
  | "TRANSPORT_NOT_STARTED"
  | "TRANSPORT_SEND_FAILED"
  | "HANDSHAKE_FAILED"
  | "HANDSHAKE_TIMEOUT"
  | "INVALID_MESSAGE"
  | "SDK_NOT_INITIALIZED"
  | "SDK_ALREADY_DESTROYED"
  | "REQUEST_CANCELLED"
  | "HOST_ERROR";

export interface SdkErrorOptions {
  code: SdkErrorCode | (string & {});
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Root of the SDK's error hierarchy. Every error the SDK throws is an
 * instance of `SdkError` (or one of its subclasses below), so consumers can
 * reliably `catch (err) { if (err instanceof SdkError) ... }` instead of
 * pattern-matching on message strings.
 */
export class SdkError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  readonly cause: unknown;

  constructor(options: SdkErrorOptions) {
    super(options.message);
    this.name = "SdkError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
