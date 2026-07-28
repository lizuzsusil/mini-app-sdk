import type { Logger } from './logger';

/**
 * A `Logger` that discards everything. This is the SDK's default logger so
 * that omitting a logger has zero behavioral or performance cost — consumers
 * only pay for logging if they opt in by injecting a real implementation.
 */
export class NoopLogger implements Logger {
  debug(): void {
    // intentionally empty
  }

  info(): void {
    // intentionally empty
  }

  warn(): void {
    // intentionally empty
  }

  error(): void {
    // intentionally empty
  }
}

/** Shared singleton instance — stateless, safe to reuse everywhere. */
export const noopLogger: Logger = new NoopLogger();
