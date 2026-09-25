export type SdkErrorCode =
  | "TIMEOUT"
  | "TRANSPORT_NOT_STARTED"
  | "TRANSPORT_SEND_FAILED"
  | "HANDSHAKE_FAILED"
  | "HANDSHAKE_TIMEOUT"
  | "INVALID_MESSAGE"
  | "INVALID_OPTIONS"
  | "SDK_NOT_INITIALIZED"
  | "SDK_ALREADY_DESTROYED"
  | "REQUEST_CANCELLED"
  | "STREAM_CANCELLED"
  | "HTTP_CLIENT_ERROR"
  | "HTTP_SERVER_ERROR"
  | "HOST_ERROR";

export interface SdkErrorOptions {
  code: SdkErrorCode | (string & {});
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

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

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message }
          : this.cause,
    };
  }
}
