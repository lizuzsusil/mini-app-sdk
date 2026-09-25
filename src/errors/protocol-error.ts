import type { PlatformError } from "../protocol";
import { SdkError } from "./sdk-error";

export class ProtocolError extends SdkError {
  readonly reason: "malformed-message" | "host-rejected";

  constructor(params: {
    reason: "malformed-message" | "host-rejected";
    platformError?: PlatformError;
    message?: string;
  }) {
    const platformError = params.platformError;
    super({
      code: platformError?.code ?? "INVALID_MESSAGE",
      message:
        params.message ??
        platformError?.message ??
        "Received an invalid protocol message",
      retryable: platformError?.retryable ?? false,
      details: platformError?.details,
    });
    this.name = "ProtocolError";
    this.reason = params.reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
