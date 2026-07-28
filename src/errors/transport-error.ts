import { SdkError, type SdkErrorOptions } from './sdk-error';

/**
 * Raised when the underlying `Transport` implementation fails to start,
 * send, or otherwise operate — as opposed to a failure at the RPC/protocol
 * layer above it. A `TransportError` means the pipe itself is broken.
 */
export class TransportError extends SdkError {
  constructor(options: Omit<SdkErrorOptions, 'code'> & { code?: SdkErrorOptions['code'] }) {
    super({ ...options, code: options.code ?? 'TRANSPORT_SEND_FAILED' });
    this.name = 'TransportError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
