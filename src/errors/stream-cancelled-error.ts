import { SdkError } from "./sdk-error";

/**
 * Raised when a streamed response is cancelled before it completes — either
 * explicitly via `StreamBuilder.cancel()` or because the mini app aborted the
 * owning `AbortSignal`. Never retryable: a cancellation is the caller's
 * explicit choice, not a transient failure.
 */
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
