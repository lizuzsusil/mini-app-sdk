import type { SdkErrorOptions } from "./sdk-error";
import { SdkError } from "./sdk-error";

export class TransportError extends SdkError {
  constructor(
    options: Omit<SdkErrorOptions, "code"> & { code?: SdkErrorOptions["code"] },
  ) {
    super({ ...options, code: options.code ?? "TRANSPORT_SEND_FAILED" });
    this.name = "TransportError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
