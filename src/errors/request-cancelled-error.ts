import { SdkError } from "./sdk-error";

export interface RequestCancelledErrorOptions {
  namespace: string;
  action: string;
  cause?: unknown;
}

/**
 * Raised when a caller aborts an in-flight request via its `AbortSignal`
 * before the host answers. Never retryable: a cancellation is the caller's
 * explicit choice, not a transient failure.
 */
export class RequestCancelledError extends SdkError {
  readonly namespace: string;
  readonly action: string;

  constructor(options: RequestCancelledErrorOptions) {
    super({
      code: "REQUEST_CANCELLED",
      message: `Request "${options.namespace}.${options.action}" was cancelled`,
      retryable: false,
      cause: options.cause,
    });
    this.name = "RequestCancelledError";
    this.namespace = options.namespace;
    this.action = options.action;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
