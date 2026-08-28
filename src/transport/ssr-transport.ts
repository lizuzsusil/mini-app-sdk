import { TransportError } from "../errors";
import type { PlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "./transport";

/**
 * No-op transport for SSR / edge runtimes where `window` is unavailable.
 * `start()` is a no-op, `send()` throws `TransportError` (requests will be
 * handled by retry/timeout), and `hostDescriptor` can be injected via
 * `globalThis.__GSA_HOST_DESCRIPTOR__` or env rather than a real transport.
 *
 * Intended for Next.js App Router SSR prefetch: the SDK can be instantiated
 * without a transport, and navigation will re-instantiate with a real
 * transport on the client.
 */
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
