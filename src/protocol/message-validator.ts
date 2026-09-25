import { PROTOCOL_VERSION } from "../constants";
import type { PlatformError, PlatformMessage } from "./message.types";

const MESSAGE_TYPES = new Set([
  "request",
  "response",
  "event",
  "handshake",
  "stream",
]);

export interface MessageValidationResult {
  valid: boolean;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidPlatformError(value: unknown): value is PlatformError {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.code)) return false;
  if (!isNonEmptyString(value.message)) return false;
  if (value.retryable !== undefined && typeof value.retryable !== "boolean")
    return false;
  if (value.details !== undefined && !isRecord(value.details)) return false;
  return true;
}

export function isValidPlatformMessage(data: unknown): data is PlatformMessage {
  return validatePlatformMessage(data).valid;
}

export function validatePlatformMessage(
  data: unknown,
): MessageValidationResult {
  if (!isRecord(data)) {
    return { valid: false, reason: "message is not an object" };
  }

  if (!isNonEmptyString(data.channel)) {
    return { valid: false, reason: 'missing or invalid "channel"' };
  }

  if (!isNonEmptyString(data.requestId)) {
    return {
      valid: false,
      reason: 'missing or invalid "requestId" (correlation id)',
    };
  }

  if (typeof data.type !== "string" || !MESSAGE_TYPES.has(data.type)) {
    return {
      valid: false,
      reason: `missing or invalid "type" (must be one of ${[...MESSAGE_TYPES].join(", ")})`,
    };
  }

  if (!isNonEmptyString(data.namespace)) {
    return { valid: false, reason: 'missing or invalid "namespace"' };
  }

  if (!isNonEmptyString(data.action)) {
    return { valid: false, reason: 'missing or invalid "action"' };
  }

  if (!isNonEmptyString(data.source)) {
    return { valid: false, reason: 'missing or invalid "source"' };
  }

  if (!isNonEmptyString(data.target)) {
    return { valid: false, reason: 'missing or invalid "target"' };
  }

  if (!isNonEmptyString(data.gsaProtocolVersion)) {
    return { valid: false, reason: 'missing or invalid "gsaProtocolVersion"' };
  }

  if (!isNonEmptyString(data.traceId)) {
    return { valid: false, reason: 'missing or invalid "traceId"' };
  }

  if (typeof data.timestamp !== "number" || !Number.isFinite(data.timestamp)) {
    return { valid: false, reason: 'missing or invalid "timestamp"' };
  }

  if (data.error !== undefined && !isValidPlatformError(data.error)) {
    return { valid: false, reason: 'invalid "error" shape' };
  }

  if (data.type === "stream") {
    if (
      data.streamIndex !== undefined &&
      (typeof data.streamIndex !== "number" ||
        !Number.isFinite(data.streamIndex))
    ) {
      return {
        valid: false,
        reason: 'invalid "streamIndex" on stream message',
      };
    }
    if (
      data.streamTotal !== undefined &&
      (typeof data.streamTotal !== "number" ||
        !Number.isFinite(data.streamTotal))
    ) {
      return {
        valid: false,
        reason: 'invalid "streamTotal" on stream message',
      };
    }
    if (data.streamLast !== undefined && typeof data.streamLast !== "boolean") {
      return { valid: false, reason: 'invalid "streamLast" on stream message' };
    }
  }

  return { valid: true };
}

export function majorVersionsMatch(a: string, b: string): boolean {
  return a.split(".")[0] === b.split(".")[0];
}

export function hasCompatibleMajorVersion(
  message: PlatformMessage,
  expected: string = PROTOCOL_VERSION,
): boolean {
  return majorVersionsMatch(message.gsaProtocolVersion, expected);
}
