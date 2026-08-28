import type { PlatformMessage } from "../protocol";
import { isValidPlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "./transport";

/**
 * Transport over BroadcastChannel. Enables multi-tab host coordination
 * where several mini-apps share a single host channel.
 */
export class BroadcastTransport implements Transport {
  private readonly channel: BroadcastChannel;
  private onMessageCallback: ((msg: PlatformMessage) => void) | null = null;
  private started = false;

  constructor(channelName = "gov-platform-sdk") {
    this.channel = new BroadcastChannel(channelName);
  }

  start(onMessage: (message: PlatformMessage) => void): void {
    this.onMessageCallback = onMessage;
    this.channel.addEventListener(
      "message",
      this.handleMessage as EventListener,
    );
    this.started = true;
  }

  stop(): void {
    this.channel.removeEventListener(
      "message",
      this.handleMessage as EventListener,
    );
    this.channel.close();
    this.onMessageCallback = null;
    this.started = false;
  }

  send(message: PlatformMessage): void {
    this.channel.postMessage(message);
  }

  getDebugInfo(): TransportDebugInfo {
    return { started: this.started };
  }

  private handleMessage = (event: MessageEvent): void => {
    if (!isValidPlatformMessage(event.data)) return;
    this.onMessageCallback?.(event.data);
  };
}
