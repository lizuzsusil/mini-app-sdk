import { SdkError } from "./sdk-error";

/**
 * Raised when an HTTP request resolves but the host's response carries a 5xx
 * status. Marked `retryable: true` so the request participates in the RPC
 * retry machinery — a transient upstream failure is exactly the case the
 * backoff/retry policy was built for.
 */
export class HttpServerError extends SdkError {
  /** The HTTP status code the host reported (e.g. 500, 502, 503). */
  readonly status: number;

  constructor(params: {
    status: number;
    message?: string;
    details?: Record<string, unknown>;
  }) {
    super({
      code: "HTTP_SERVER_ERROR",
      message:
        params.message ??
        `HTTP request failed with server error status ${params.status}`,
      retryable: true,
      details: params.details,
    });
    this.name = "HttpServerError";
    this.status = params.status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
