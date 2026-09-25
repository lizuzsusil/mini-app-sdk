import type { PlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "../transport";

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

  simulateIncoming(message: PlatformMessage): void {
    this.onMessage?.(message);
  }

  get started(): boolean {
    return this.startCallCount > 0 && this.onMessage !== null;
  }

  get startCalls(): number {
    return this.startCallCount;
  }

  get stopCalls(): number {
    return this.stopCallCount;
  }

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
