export type {
  HandshakeAckPayload,
  HandshakePayload,
  MessageType,
  PlatformError,
  PlatformMessage,
} from "./message.types";
export type { CreateMessageOptions } from "./message-factory";
export { createMessage } from "./message-factory";
export type { MessageValidationResult } from "./message-validator";
export {
  hasCompatibleMajorVersion,
  isValidPlatformMessage,
  majorVersionsMatch,
  validatePlatformMessage,
} from "./message-validator";
