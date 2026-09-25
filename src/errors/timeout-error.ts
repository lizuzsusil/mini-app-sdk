import { SdkError } from "./sdk-error";

export class TimeoutError extends SdkError {
  constructor(params: {
    namespace: string;
    action: string;
    timeoutMs: number;
  }) {
    super({
      code: "TIMEOUT",
      message: `Request "${params.namespace}.${params.action}" timed out after ${params.timeoutMs}ms`,
      retryable: true,
      details: {
        namespace: params.namespace,
        action: params.action,
        timeoutMs: params.timeoutMs,
      },
    });
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
