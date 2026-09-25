import { SdkError } from "./sdk-error";

export class HttpServerError extends SdkError {
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
