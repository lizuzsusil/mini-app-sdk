import { SdkError } from "./sdk-error";

/**
 * Raised when an HTTP request resolves but the host's response carries a 4xx
 * status. Distinct from `HttpServerError` so consumers can branch on the kind
 * of failure: 4xx is never retryable — the request itself was rejected, and
 * retrying it would only fail again.
 */
export class HttpClientError extends SdkError {
  /** The HTTP status code the host reported (e.g. 404, 422). */
  readonly status: number;

  constructor(params: {
    status: number;
    message?: string;
    details?: Record<string, unknown>;
  }) {
    super({
      code: "HTTP_CLIENT_ERROR",
      message:
        params.message ??
        `HTTP request failed with client error status ${params.status}`,
      retryable: false,
      details: params.details,
    });
    this.name = "HttpClientError";
    this.status = params.status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
