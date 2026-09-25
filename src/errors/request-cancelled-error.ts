import { SdkError } from "./sdk-error";

export interface RequestCancelledErrorOptions {
  namespace: string;
  action: string;
  cause?: unknown;
}

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
