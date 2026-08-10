import type { PlatformError } from "../protocol/message.types";
import { SdkError } from "./sdk-error";

/**
 * Raised in two situations:
 *  1. An incoming message from the host fails runtime validation (malformed
 *     envelope, wrong protocol version, missing required fields).
 *  2. The host explicitly returned a `PlatformError` inside a `response`
 *     message — i.e. the request reached the host and the host rejected it.
 *
 * Distinguishing (1) from (2) matters for debugging: (1) means "we don't
 * trust what we received", (2) means "the host understood us and said no".
 * Use the `reason` field to tell them apart.
 */
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
