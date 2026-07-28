import { SdkError } from './sdk-error';

/**
 * Raised when the initial handshake with the host fails or times out.
 * Kept distinct from `TimeoutError`/`ProtocolError` because a failed
 * handshake is a fatal condition for the whole SDK instance (nothing can
 * proceed), whereas a single request timing out is typically recoverable.
 */
export class HandshakeError extends SdkError {
  constructor(params: { message: string; cause?: unknown; timedOut?: boolean }) {
    super({
      code: params.timedOut ? 'HANDSHAKE_TIMEOUT' : 'HANDSHAKE_FAILED',
      message: params.message,
      retryable: false,
      cause: params.cause,
    });
    this.name = 'HandshakeError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
