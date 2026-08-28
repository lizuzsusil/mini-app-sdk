/**
 * Re-export wire types from the single source `@lizuz/mini-app-types`.
 * Local `PlatformMessage` / `Handshake*` are kept in sync via the package.
 */
export type {
  HandshakeAckPayload,
  HandshakePayload,
  MessageType,
  PlatformError,
  PlatformMessage,
} from "@lizuz/mini-app-types";
