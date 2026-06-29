import { MESSAGE_CHANNEL, PROTOCOL_VERSION } from './constants';
import type { PlatformMessage } from './types';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMessage(
  type: PlatformMessage['type'],
  namespace: string,
  action: string,
  source: string,
  target: string,
  payload?: unknown,
  extra?: { id?: string; traceId?: string; version?: string; error?: PlatformMessage['error'] }
): PlatformMessage {
  return {
    channel: MESSAGE_CHANNEL,
    id: extra?.id ?? generateId(),
    type,
    namespace,
    action,
    source,
    target,
    version: extra?.version ?? PROTOCOL_VERSION,
    payload,
    error: extra?.error,
    traceId: extra?.traceId ?? generateId(),
    timestamp: Date.now(),
  };
}

export function isPlatformMessage(data: unknown): data is PlatformMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.id === 'string' && typeof msg.type === 'string' && typeof msg.namespace === 'string' && typeof msg.action === 'string';
}
