import { TransportError } from "../errors";
import type { PlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "./transport";

export class SsrTransport implements Transport {
  private started = false;

  start(_onMessage: (message: PlatformMessage) => void): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  send(_message: PlatformMessage): void {
    throw new TransportError({
      code: "TRANSPORT_NOT_STARTED",
      message:
        "SsrTransport cannot send — no host connected in SSR. Use a browser transport on the client.",
    });
  }

  getDebugInfo(): TransportDebugInfo {
    return { started: this.started };
  }
}
