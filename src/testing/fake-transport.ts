import type { PlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "../transport";

/**
 * An in-memory `Transport` implementation for unit tests. Records every
 * sent message and lets the test drive inbound messages by calling
 * `simulateIncoming`, without touching `window`, `postMessage`, or any
 * other browser API.
 *
 * Not exported from the package's main entry point — import it from the
 * `@lizuzsusil/mini-app-sdk/testing` subpath so it never ships in
 * production bundles.
 */
export class FakeTransport implements Transport {
  readonly sent: PlatformMessage[] = [];

  private onMessage: ((message: PlatformMessage) => void) | null = null;
  private startCallCount = 0;
  private stopCallCount = 0;

  start(onMessage: (message: PlatformMessage) => void): void {
    this.onMessage = onMessage;
    this.startCallCount += 1;
  }

  stop(): void {
    this.onMessage = null;
    this.stopCallCount += 1;
  }

  send(message: PlatformMessage): void {
    this.sent.push(message);
  }

  /** Test helper: deliver an inbound message as if it came from the host. */
  simulateIncoming(message: PlatformMessage): void {
    this.onMessage?.(message);
  }

  /** Test helper: was `start()` called? */
  get started(): boolean {
    return this.startCallCount > 0 && this.onMessage !== null;
  }

  /** Test helper: how many times was `start()` called. */
  get startCalls(): number {
    return this.startCallCount;
  }

  /** Test helper: how many times was `stop()` called. */
  get stopCalls(): number {
    return this.stopCallCount;
  }

  /** Test helper: the most recently sent message, if any. */
  get lastSent(): PlatformMessage | undefined {
    return this.sent[this.sent.length - 1];
  }

  getDebugInfo(): TransportDebugInfo {
    return {
      started: this.started,
      pinnedOrigin: null,
    };
  }
}
