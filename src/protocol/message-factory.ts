import { MESSAGE_CHANNEL, PROTOCOL_VERSION } from "../constants";
import { generateId } from "../utils";
import type {
  MessageType,
  PlatformError,
  PlatformMessage,
} from "./message.types";

export interface CreateMessageOptions {
  requestId?: string;
  traceId?: string;
  gsaProtocolVersion?: string;
  error?: PlatformError;
}

export function createMessage<TPayload = unknown>(
  type: MessageType,
  namespace: string,
  action: string,
  source: string,
  target: string,
  payload?: TPayload,
  options?: CreateMessageOptions,
): PlatformMessage<TPayload> {
  return {
    channel: MESSAGE_CHANNEL,
    requestId: options?.requestId ?? generateId(),
    type,
    namespace,
    action,
    source,
    target,
    gsaProtocolVersion: options?.gsaProtocolVersion ?? PROTOCOL_VERSION,
    payload,
    error: options?.error,
    traceId: options?.traceId ?? generateId(),
    timestamp: Date.now(),
  };
}
