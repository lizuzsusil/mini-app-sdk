import {
  BROADCAST_TARGET,
  MESSAGE_CHANNEL,
  PLATFORM_EVENT_NAME,
} from "../constants";
import { TransportError } from "../errors";
import type { Logger } from "../logging";
import { noopLogger } from "../logging";
import type { PlatformMessage } from "../protocol";
import { isValidPlatformMessage, validatePlatformMessage } from "../protocol";
import type { Transport, TransportDebugInfo } from "./transport";

export interface DefaultTransportOptions {
  logger?: Logger;
  /**
   * The exact origin (e.g. `https://shell.example.gov`) this transport is
   * allowed to talk to. When set, every inbound message from any other
   * origin is dropped from the moment `start()` is called, and every
   * outbound message is sent to this origin instead of `'*'`.
   *
   * When omitted (the default), the transport trusts nothing about the
   * host's origin ahead of time — it sends the first message (the
   * handshake) with target origin `'*'`, since there is no way to know the
   * host's origin before hearing from it, then learns and pins the origin
   * of the first valid message it receives. Every message after that must
   * come from that same pinned origin, and every message sent after that
   * point goes there directly instead of broadcasting to `'*'`.
   */
  allowedOrigin?: string;
  /**
   * Whether to listen on the `CustomEvent` channel (`gov-platform-event`).
   * Default `true` for backward compat with Flutter WebView bridges; set
   * `false` to harden — CustomEvent has no origin, so it bypasses origin
   * checks. Hosts using only `postMessage` should disable it.
   */
  allowCustomEvent?: boolean;
  /**
   * When true, `send()` warns if `targetOrigin` is still `*` (unpinned)
   * outside local dev. Useful to surface “origin not pinned” in prod.
   */
  warnOnBroadcast?: boolean;
}

/**
 * The SDK's built-in `Transport` implementation. Sends via
 * `window.parent.postMessage` and listens on two inbound channels:
 *
 *  1. The standard `message` event — the primary channel for a browser
 *     iframe host, or a Flutter WebView that intercepts and re-dispatches
 *     `postMessage`.
 *  2. A `gov-platform-event` `CustomEvent` — a secondary channel for hosts
 *     that find it easier to dispatch a custom event than to synthesize a
 *     `MessageEvent`. `CustomEvent`s dispatched within the same window
 *     don't carry a meaningful cross-origin `origin` field, so the origin
 *     checks below only apply to the `message` channel.
 *
 * This is intentionally the *only* file in the SDK that touches `window`.
 */
export class DefaultTransport implements Transport {
  private readonly logger: Logger;
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private customEventListener: ((event: Event) => void) | null = null;
  private started = false;
  private readonly allowCustomEvent: boolean;
  private readonly warnOnBroadcast: boolean;

  /** The origin outbound messages are sent to, and inbound messages are checked against once set. */
  private pinnedOrigin: string | null;
  /** True when `allowedOrigin` was explicitly configured — the pinned origin can never change in that case. */
  private readonly originLocked: boolean;

  constructor(options: DefaultTransportOptions = {}) {
    this.logger = options.logger ?? noopLogger;
    this.pinnedOrigin = options.allowedOrigin ?? null;
    this.originLocked = options.allowedOrigin !== undefined;
    this.allowCustomEvent = options.allowCustomEvent ?? true;
    this.warnOnBroadcast = options.warnOnBroadcast ?? false;
  }

  start(onMessage: (message: PlatformMessage) => void): void {
    if (typeof window === "undefined") {
      throw new TransportError({
        code: "TRANSPORT_NOT_STARTED",
        message:
          "DefaultTransport requires a `window` global (browser or WebView environment).",
      });
    }

    this.messageListener = (event: MessageEvent) => {
      if (!this.isFromAllowedOrigin(event.origin)) {
        this.logger.warn("Dropped message from an unexpected origin", {
          receivedOrigin: event.origin,
          pinnedOrigin: this.pinnedOrigin,
        });
        return;
      }
      if (!isValidPlatformMessage(event.data)) {
        // In dev, surface validation reason when the message at least looks
        // like an SDK message (has the channel). Avoid noise from unrelated
        // postMessage traffic on the same window.
        const data = event.data as Record<string, unknown> | null;
        if (
          data &&
          typeof data === "object" &&
          (data as Record<string, unknown>).channel === MESSAGE_CHANNEL
        ) {
          const result = validatePlatformMessage(event.data);
          this.logger.debug("Dropped invalid SDK message", {
            reason: result.reason,
          });
        }
        return;
      }

      this.pinOriginIfUnset(event.origin);
      onMessage(event.data);
    };
    window.addEventListener("message", this.messageListener);

    if (this.allowCustomEvent) {
      this.customEventListener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail;
        if (!isValidPlatformMessage(detail)) {
          const d = detail as Record<string, unknown> | null;
          if (
            d &&
            typeof d === "object" &&
            (d as Record<string, unknown>).channel === MESSAGE_CHANNEL
          ) {
            const result = validatePlatformMessage(detail);
            this.logger.debug("Dropped invalid SDK message on CustomEvent", {
              reason: result.reason,
            });
          }
          return;
        }
        onMessage(detail);
      };
      window.addEventListener(PLATFORM_EVENT_NAME, this.customEventListener);
    } else {
      this.logger.debug(
        "CustomEvent channel disabled (allowCustomEvent:false)",
      );
    }

    this.logger.debug("DefaultTransport started", {
      allowedOrigin: this.pinnedOrigin ?? "(learned on first message)",
      allowCustomEvent: this.allowCustomEvent,
    });
    this.started = true;
  }

  stop(): void {
    if (typeof window === "undefined") return;

    if (this.messageListener) {
      window.removeEventListener("message", this.messageListener);
      this.messageListener = null;
    }
    if (this.customEventListener) {
      window.removeEventListener(PLATFORM_EVENT_NAME, this.customEventListener);
      this.customEventListener = null;
    }

    this.started = false;
    this.logger.debug("DefaultTransport stopped");
  }

  getDebugInfo(): TransportDebugInfo {
    return {
      started: this.started,
      pinnedOrigin: this.pinnedOrigin,
    };
  }

  send(message: PlatformMessage): void {
    if (typeof window === "undefined") {
      throw new TransportError({
        code: "TRANSPORT_NOT_STARTED",
        message:
          "DefaultTransport requires a `window` global (browser or WebView environment).",
      });
    }

    const targetOrigin = this.pinnedOrigin ?? BROADCAST_TARGET;
    if (this.warnOnBroadcast && targetOrigin === BROADCAST_TARGET) {
      this.logger.warn(
        'Sending to "*" — origin not pinned. Set allowedOrigin/targetOrigin to harden.',
        { namespace: message.namespace, action: message.action },
      );
    }

    try {
      window.parent.postMessage(message, targetOrigin);
    } catch (cause) {
      throw new TransportError({
        message: `Failed to send message "${message.namespace}.${message.action}"`,
        cause,
      });
    }
  }

  private isFromAllowedOrigin(origin: string): boolean {
    if (this.pinnedOrigin === null) return true;
    if (this.pinnedOrigin === "*") return true;
    return origin === this.pinnedOrigin;
  }

  private pinOriginIfUnset(origin: string): void {
    if (this.originLocked || this.pinnedOrigin !== null) return;
    this.pinnedOrigin = origin;
    this.logger.debug("Pinned host origin from first message", { origin });
  }
}
