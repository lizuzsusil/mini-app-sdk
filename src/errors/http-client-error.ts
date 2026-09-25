import { SdkError } from "./sdk-error";

export class HttpClientError extends SdkError {
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
