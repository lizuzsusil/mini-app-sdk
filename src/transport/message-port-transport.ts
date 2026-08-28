import type { PlatformMessage } from "../protocol";
import { isValidPlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "./transport";

/**
 * Transport over MessagePort (Web Worker, DedicatedWorker, or iframe MessageChannel).
 * Suitable for off-main-thread hosts or multi-tab coordination.
 */
export class MessagePortTransport implements Transport {
  private readonly port: MessagePort;
  private onMessageCallback: ((msg: PlatformMessage) => void) | null = null;
  private started = false;

  constructor(port: MessagePort) {
    this.port = port;
  }

  start(onMessage: (message: PlatformMessage) => void): void {
    this.onMessageCallback = onMessage;
    this.port.addEventListener("message", this.handleMessage as EventListener);
    // MessagePort requires explicit start() in some implementations.
    if (
      typeof (this.port as unknown as { start?: () => void }).start ===
      "function"
    ) {
      (this.port as unknown as { start: () => void }).start();
    }
    this.started = true;
  }

  stop(): void {
    this.port.removeEventListener(
      "message",
      this.handleMessage as EventListener,
    );
    this.onMessageCallback = null;
    this.started = false;
  }

  send(message: PlatformMessage): void {
    this.port.postMessage(message);
  }

  getDebugInfo(): TransportDebugInfo {
    return { started: this.started };
  }

  private handleMessage = (event: MessageEvent): void => {
    if (!isValidPlatformMessage(event.data)) return;
    this.onMessageCallback?.(event.data);
  };
}
