/** Aggregate stats for one namespace.action pair. */
export interface ActionMetrics {
  count: number;
  successes: number;
  failures: number;
  timeouts: number;
  retries: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

/** A full snapshot of everything the SDK has recorded since it was constructed (or since the last `reset()`). */
export interface RpcMetricsSnapshot {
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  totalRetries: number;
  averageDurationMs: number;
  /** Keyed by `"namespace.action"`, e.g. `"auth.getUser"`. */
  byAction: Record<string, ActionMetrics>;
}
