/**
 * Re-export shared transport types from the single source `@lizuz/mini-app-types`.
 * SDK's `Transport` interface is host-agnostic and lives in the types package
 * to keep SDK and host shell in sync.
 */
export type {
  DefaultTransportOptions,
  Transport,
  TransportDebugInfo,
  WebSocketTransportOptions,
} from "@lizuz/mini-app-types";
