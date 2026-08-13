import type { PlatformMessage } from "../protocol";

/**
 * A `Transport` is a dumb pipe: it can start listening, stop listening, and
 * send a raw envelope. It knows nothing about requests, correlation ids,
 * timeouts, retries, or events — that behavior lives one layer up, in
 * `RpcClient` (see `rpc/RpcClient.ts`).
 *
 * Keeping `Transport` this narrow is what makes the SDK host-agnostic: a
 * new host environment (Electron IPC, a Web Worker, a React Native bridge)
 * only ever needs to implement these three methods. Nothing about
 * `RpcClient`, the modules, or `MiniAppSdk` needs to know or care.
 *
 * Vendor mini-app developers never construct a `Transport` themselves — a
 * host SDK provides one, or the SDK falls back to `DefaultTransport`.
 */
export interface Transport {
  /**
   * Begin listening for inbound messages. `onMessage` is invoked once per
   * inbound envelope; the transport does not need to validate or interpret
   * the envelope's contents — that is the caller's responsibility.
   */
  start(onMessage: (message: PlatformMessage) => void): void;

  /**
   * Stop listening and release any resources (event listeners, timers,
   * sockets, etc.) acquired in `start`. Must be safe to call even if
   * `start` was never called, and safe to call more than once.
   */
  stop(): void;

  /**
   * Send a single envelope to the host. Delivery is fire-and-forget from
   * the transport's point of view — request/response semantics, timeouts,
   * and retries are the caller's (`RpcClient`'s) responsibility, not the
   * transport's.
   */
  send(message: PlatformMessage): void;

  /**
   * Optional introspection used by `MiniAppSdk.debug.snapshot()`. A
   * transport that has nothing to report (or doesn't want to) may omit it.
   */
  getDebugInfo?(): TransportDebugInfo;
}

/** Debug-time view of a transport, for `MiniAppSdk.debug.snapshot()`. */
export interface TransportDebugInfo {
  /** Whether the transport is currently listening for inbound messages. */
  started: boolean;
  /** The origin outbound messages are pinned to, when known. */
  pinnedOrigin?: string | null;
}
