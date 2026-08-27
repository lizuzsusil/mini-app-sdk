import { PROTOCOL_VERSION } from "../constants";
import type { PlatformMessage } from "../protocol";
import { createMessage } from "../protocol";
import type { Transport } from "../transport";
import { FakeTransport } from "./fake-transport";

/**
 * A minimal host harness for integration tests. Wraps a `FakeTransport`
 * and auto-answers the SDK handshake plus `platform.getType` so
 * `sdk.initialize()` can succeed without manual message crafting.
 *
 * ```ts
 * const host = new MockHost({ capabilities: ['auth','storage'] });
 * const sdk = new MiniAppSdk({ miniAppId: 'test' }, { transport: host.transport });
 * await sdk.initialize(); // handshake auto-answered
 * ```
 */
export interface MockHostOptions {
  capabilities?: string[];
  protocolVersion?: string;
  platformType?: string; // 'web' | 'flutter' | custom
  appearanceHint?: { locale?: unknown; theme?: unknown };
  autoRespondHandshake?: boolean;
  autoRespondGetType?: boolean;
}

export class MockHost {
  readonly transport: FakeTransport;
  readonly options: Required<MockHostOptions>;

  constructor(opts: MockHostOptions = {}) {
    this.options = {
      capabilities: opts.capabilities ?? [
        "auth",
        "storage",
        "platform",
        "device",
        "appearance",
      ],
      protocolVersion: opts.protocolVersion ?? PROTOCOL_VERSION,
      platformType: opts.platformType ?? "web",
      appearanceHint: opts.appearanceHint ?? { locale: "en", theme: "light" },
      autoRespondHandshake: opts.autoRespondHandshake ?? true,
      autoRespondGetType: opts.autoRespondGetType ?? true,
    };
    this.transport = new FakeTransport();
    // Intercept FakeTransport.send to capture outbound and optionally auto-respond.
    const origSend = this.transport.send.bind(this.transport);
    this.transport.send = (msg: PlatformMessage) => {
      origSend(msg);
      this.handleOutbound(msg);
    };
  }

  /** Direct access to captured outbound messages. */
  get sent(): PlatformMessage[] {
    return this.transport.sent;
  }

  /** Simulate an inbound host message (bypasses validation). */
  emit(message: PlatformMessage): void {
    this.transport.simulateIncoming(message);
  }

  /** Simulate a host event. */
  emitEvent(namespace: string, action: string, payload?: unknown): void {
    const msg = createMessage(
      "event",
      namespace,
      action,
      "shell",
      "*",
      payload,
      {
        traceId: "test-trace",
      },
    );
    // Events are addressed to miniAppId or "*"; use "*".
    this.transport.simulateIncoming(msg as unknown as PlatformMessage);
  }

  private handleOutbound(msg: PlatformMessage): void {
    if (
      msg.namespace === "handshake" &&
      msg.action === "connect" &&
      this.options.autoRespondHandshake
    ) {
      // Defer to next tick so handshake promise has registered pending handler.
      queueMicrotask(() => {
        const ack = createMessage(
          "handshake",
          "handshake",
          "connect",
          "shell",
          msg.source,
          {
            status: "ok",
            protocolVersion: this.options.protocolVersion,
            capabilities: this.options.capabilities,
          } as unknown,
          {
            traceId: msg.traceId,
            requestId: msg.requestId,
          },
        );
        // handshake response type is "handshake" with same requestId
        (ack as unknown as Record<string, unknown>).type = "handshake";
        this.transport.simulateIncoming(ack as unknown as PlatformMessage);
      });
      return;
    }
    if (
      msg.namespace === "platform" &&
      msg.action === "getType" &&
      this.options.autoRespondGetType
    ) {
      queueMicrotask(() => {
        const payload =
          this.options.appearanceHint != null
            ? {
                type: this.options.platformType,
                appearance: this.options.appearanceHint,
              }
            : this.options.platformType;
        const res = createMessage(
          "response",
          "platform",
          "getType",
          "shell",
          msg.source,
          payload as unknown,
          {
            traceId: msg.traceId,
            requestId: msg.requestId,
          },
        );
        this.transport.simulateIncoming(res as PlatformMessage);
      });
    }
  }

  /** Transport adapter that can be passed directly to MiniAppSdk deps (alias). */
  get asTransport(): Transport {
    return this.transport as unknown as Transport;
  }
}
