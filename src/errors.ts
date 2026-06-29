import type { PlatformError } from './types';

export class SdkError extends Error {
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(error: PlatformError) {
    super(error.message);
    this.name = 'SdkError';
    this.code = error.code;
    this.retryable = error.retryable ?? false;
    this.details = error.details;
  }
}
