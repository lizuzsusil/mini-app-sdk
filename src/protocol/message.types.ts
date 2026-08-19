/**
 * The message kinds that can travel over the transport. `stream` is the
 * incremental delivery channel for long-running responses: a single
 * request is answered by a sequence of `stream` messages, each carrying
 * one ordered `streamIndex`, with the final one flagged `streamLast: true`.
 */
export type MessageType =
  | "request"
  | "response"
  | "event"
  | "handshake"
  | "stream";

/**
 * Structured error shape carried inside a `response` message when the host
 * could not fulfil a request. This is the wire representation; the SDK
 * converts it into a typed `SdkError` subclass before handing it to
 * consumer code (see `errors/`).
 */
export interface PlatformError {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

/**
 * The single envelope shape every message — in either direction — must
 * conform to. Field names and meanings are frozen for the current
 * `PROTOCOL_VERSION`; do not change without a protocol version bump.
 */
export interface PlatformMessage<TPayload = unknown> {
  channel: string;
  requestId: string;
  type: MessageType;
  namespace: string;
  action: string;
  source: string;
  target: string;
  gsaProtocolVersion: string;
  payload?: TPayload;
  error?: PlatformError;
  traceId: string;
  timestamp: number;

  /**
   * Only present on `stream` messages. Zero-based position of this chunk
   * in the overall response, the total chunk count when the host knows it
   * up front, and a flag marking the final chunk.
   */
  streamIndex?: number;
  streamTotal?: number;
  streamLast?: boolean;
}

/**
 * Payload sent by the mini app during the initial handshake. `protocolVersion`
 * and `capabilities` let the host decide, before anything else happens,
 * whether it can talk to this SDK build at all and which namespaces it
 * should expect requests for.
 */
export interface HandshakePayload {
  miniAppId: string;
  sdkVersion: string;
  protocolVersion: string;
  capabilities: string[];
}

/**
 * Payload the host is expected to send back in its handshake response.
 * Every field is optional so a host that hasn't been updated to send them
 * yet still completes a handshake successfully — the SDK only tightens its
 * behavior (rejecting a mismatched version, narrowing capabilities) when a
 * host actually reports something to react to.
 */
export interface HandshakeAckPayload {
  status?: "ok" | "rejected";
  reason?: string;
  protocolVersion?: string;
  capabilities?: string[];
}
