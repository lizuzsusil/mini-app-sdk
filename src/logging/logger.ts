/**
 * Minimal, framework-agnostic logging contract. The SDK never calls
 * `console.*` directly — every internal component that needs to log takes
 * a `Logger` via constructor injection and defaults to `NoopLogger`.
 *
 * This is intentionally small in Phase 1 (no log levels config, no
 * structured sinks, no transports-for-logs). It exists now purely as the
 * seam a future phase can build real observability behind, without
 * touching any call site that already logs through this interface.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
