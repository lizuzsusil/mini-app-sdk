import { TransportError } from "../errors";
import type { PlatformMessage } from "../protocol";
import { isValidPlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "./transport";

/**
 * Transport over WebSocket. Useful for dedicated host shells, Electron,
 * or Tauri bridges where `postMessage` is unavailable. Implements the same
 * `Transport` interface so `RpcClient` remains agnostic.
 */
export interface WebSocketTransportOptions {
  url: string;
  protocols?: string | string[];
  /** Optional existing socket (for testing). */
  socket?: WebSocket;
}

export class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private readonly protocols?: string | string[];
  private onMessageCallback: ((msg: PlatformMessage) => void) | null = null;
  private started = false;

  constructor(options: WebSocketTransportOptions) {
    this.url = options.url;
    this.protocols = options.protocols;
    this.socket = options.socket ?? null;
  }

  start(onMessage: (message: PlatformMessage) => void): void {
    this.onMessageCallback = onMessage;
    if (!this.socket) {
      try {
        this.socket = new WebSocket(this.url, this.protocols);
      } catch (cause) {
        throw new TransportError({
          message: `WebSocketTransport failed to connect to ${this.url}`,
          cause,
        });
      }
    }
    this.socket.addEventListener(
      "message",
      this.handleMessage as EventListener,
    );
    this.socket.addEventListener("error", () => {
      // Let RpcClient heartbeat detect liveness.
    });
    this.started = true;
  }

  stop(): void {
    if (this.socket) {
      this.socket.removeEventListener(
        "message",
        this.handleMessage as EventListener,
      );
      // Do not close externally provided sockets automatically
      if (!this.socket) return;
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
    this.onMessageCallback = null;
    this.started = false;
  }

  send(message: PlatformMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new TransportError({
        message: "WebSocketTransport not connected — cannot send",
      });
    }
    try {
      this.socket.send(JSON.stringify(message));
    } catch (cause) {
      throw new TransportError({
        message: `WebSocketTransport send failed for ${message.namespace}.${message.action}`,
        cause,
      });
    }
  }

  getDebugInfo(): TransportDebugInfo {
    return { started: this.started, pinnedOrigin: this.url };
  }

  private handleMessage = (event: MessageEvent): void => {
    let data: unknown;
    try {
      data =
        typeof event.data === "string"
          ? JSON.parse(event.data as string)
          : event.data;
    } catch {
      return;
    }
    if (!isValidPlatformMessage(data)) return;
    this.onMessageCallback?.(data);
  };
}
