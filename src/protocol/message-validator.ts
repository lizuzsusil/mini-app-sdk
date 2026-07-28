import { PROTOCOL_VERSION } from '../constants';
import type { PlatformError, PlatformMessage } from './message.types';

const MESSAGE_TYPES = new Set(['request', 'response', 'event', 'handshake']);

export interface MessageValidationResult {
  valid: boolean;
  /** Populated when `valid` is false — a human-readable reason, safe to log. */
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidPlatformError(value: unknown): value is PlatformError {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.code)) return false;
  if (!isNonEmptyString(value.message)) return false;
  if (value.retryable !== undefined && typeof value.retryable !== 'boolean') return false;
  if (value.details !== undefined && !isRecord(value.details)) return false;
  return true;
}

/**
 * The SDK's sole trust boundary for anything arriving from the host. No
 * incoming message is dispatched to a pending request, an event handler, or
 * anywhere else in the SDK until it passes this check.
 *
 * This is deliberately a plain type guard (not an exception-throwing
 * "assert") so callers on a hot path (every `window.message` event) can
 * cheaply discard non-protocol traffic without paying exception-handling
 * cost, and can decide for themselves whether a *specific* failure (e.g.
 * "correlation id not found") is protocol-error-worthy.
 */
export function isValidPlatformMessage(data: unknown): data is PlatformMessage {
  return validatePlatformMessage(data).valid;
}

/**
 * Same check as `isValidPlatformMessage`, but returns a reason string for
 * logging/diagnostics instead of a boolean, since "the message was
 * rejected" alone isn't actionable in production.
 */
export function validatePlatformMessage(data: unknown): MessageValidationResult {
  if (!isRecord(data)) {
    return { valid: false, reason: 'message is not an object' };
  }

  if (!isNonEmptyString(data.channel)) {
    return { valid: false, reason: 'missing or invalid "channel"' };
  }

  if (!isNonEmptyString(data.requestId)) {
    return { valid: false, reason: 'missing or invalid "requestId" (correlation id)' };
  }

  if (typeof data.type !== 'string' || !MESSAGE_TYPES.has(data.type)) {
    return { valid: false, reason: `missing or invalid "type" (must be one of ${[...MESSAGE_TYPES].join(', ')})` };
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

  if (typeof data.timestamp !== 'number' || !Number.isFinite(data.timestamp)) {
    return { valid: false, reason: 'missing or invalid "timestamp"' };
  }

  if (data.error !== undefined && !isValidPlatformError(data.error)) {
    return { valid: false, reason: 'invalid "error" shape' };
  }

  return { valid: true };
}

/**
 * Compares two protocol version strings by their major component only —
 * `"3.1.0"` and `"3.4.2"` are compatible, `"3.0.0"` and `"4.0.0"` are not.
 * A minor/patch bump is expected to stay backward compatible within a
 * major version, per the SDK's SemVer policy; only a major bump signals a
 * breaking wire-format change.
 */
export function majorVersionsMatch(a: string, b: string): boolean {
  return a.split('.')[0] === b.split('.')[0];
}

/**
 * Compares the protocol version stamped on an incoming message against
 * this SDK build's `PROTOCOL_VERSION` (or an explicit `expected` value).
 * Used as the first line of defense against processing a message shaped
 * for a wire format this SDK build doesn't speak.
 */
export function hasCompatibleMajorVersion(message: PlatformMessage, expected: string = PROTOCOL_VERSION): boolean {
  return majorVersionsMatch(message.gsaProtocolVersion, expected);
}
