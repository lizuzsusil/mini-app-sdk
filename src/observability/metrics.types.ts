/**
 * Latency percentiles computed from a bounded window of recent request
 * durations. `0` when no durations have been recorded yet.
 */
export interface DurationPercentiles {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

/** Aggregate stats for one namespace.action pair. */
export interface ActionMetrics {
  count: number;
  successes: number;
  failures: number;
  timeouts: number;
  retries: number;
  totalDurationMs: number;
  averageDurationMs: number;
  /**
   * Latency percentiles over the bounded, age-windowed set of recent
   * durations for this action. Unlike the counters (which are cumulative),
   * these reflect only recent traffic, so a p99 that spiked an hour ago
   * stops skewing the picture once it ages out of the window.
   */
  percentiles: DurationPercentiles;
}

/** A full snapshot of everything the SDK has recorded since it was constructed (or since the last `reset()`). */
export interface RpcMetricsSnapshot {
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  totalRetries: number;
  averageDurationMs: number;
  /** Latency percentiles across all recorded durations (all actions combined). */
  percentiles: DurationPercentiles;
  /** Keyed by `"namespace.action"`, e.g. `"auth.getUser"`. */
  byAction: Record<string, ActionMetrics>;
}

/**
 * Tuning for `MetricsRecorder`. All fields are optional — the defaults keep
 * the recorder bounded (the duration window never grows without limit), and
 * everything here is additive to the existing counters.
 */
export interface RpcMetricsOptions {
  /**
   * Maximum number of recent durations kept per `namespace.action` for
   * percentile computation. Bounds memory on long-running mini apps.
   * Defaults to 100.
   */
  maxDurationEntries?: number;
  /**
   * When set, durations older than this (in ms) are excluded from
   * percentile computation, so the percentiles reflect a rolling recent
   * window rather than the whole lifetime. Defaults to no age cutoff.
   */
  durationsWindowMs?: number;
  /**
   * Export hook: invoked with every computed snapshot. A host can persist
   * metrics here without maintaining its own polling loop — call
   * `sdk.getMetrics()` (or read any snapshot) and the hook fires.
   */
  onSnapshot?: (snapshot: RpcMetricsSnapshot) => void;
}
