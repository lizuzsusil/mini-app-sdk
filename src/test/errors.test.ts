import { describe, it, expect } from "vitest";
import { SdkError, ErrorCodes } from "../errors";

describe("SdkError", () => {
  it("static create should produce correct SdkError", () => {
    const err = SdkError.create(
      ErrorCodes.HANDSHAKE_TIMEOUT,
      "timed out",
      true,
    );
    expect(err).toBeInstanceOf(SdkError);
    expect(err.code).toBe("HANDSHAKE_TIMEOUT");
    expect(err.retryable).toBe(true);
    expect(err.message).toBe("timed out");
  });
});
