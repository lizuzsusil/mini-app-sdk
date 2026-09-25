import { SdkError } from "./sdk-error";

export class StreamCancelledError extends SdkError {
  constructor(message = "Stream was cancelled") {
    super({
      code: "STREAM_CANCELLED",
      message,
      retryable: false,
    });
    this.name = "StreamCancelledError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
