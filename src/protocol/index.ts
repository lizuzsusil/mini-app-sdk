export type { MessageType, PlatformError, PlatformMessage, HandshakePayload, HandshakeAckPayload } from './message.types';
export { createMessage } from './message-factory';
export type { CreateMessageOptions } from './message-factory';
export { isValidPlatformMessage, validatePlatformMessage, hasCompatibleMajorVersion, majorVersionsMatch } from './message-validator';
export type { MessageValidationResult } from './message-validator';
