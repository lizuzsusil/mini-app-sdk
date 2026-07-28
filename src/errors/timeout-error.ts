import { SdkError } from './sdk-error';

/**
 * Raised when a request (or the handshake) does not receive a matching
 * response within the configured timeout. Timeouts are retryable by
 * default, since the most common cause is a transient host delay rather
 * than a permanent failure.
 */
export class TimeoutError extends SdkError {
  constructor(params: { namespace: string; action: string; timeoutMs: number }) {
    super({
      code: 'TIMEOUT',
      message: `Request "${params.namespace}.${params.action}" timed out after ${params.timeoutMs}ms`,
      retryable: true,
      details: { namespace: params.namespace, action: params.action, timeoutMs: params.timeoutMs },
    });
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
