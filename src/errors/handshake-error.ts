import { SdkError } from "./sdk-error";

export class HandshakeError extends SdkError {
  constructor(params: {
    message: string;
    cause?: unknown;
    timedOut?: boolean;
  }) {
    super({
      code: params.timedOut ? "HANDSHAKE_TIMEOUT" : "HANDSHAKE_FAILED",
      message: params.message,
      retryable: false,
      cause: params.cause,
    });
    this.name = "HandshakeError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
