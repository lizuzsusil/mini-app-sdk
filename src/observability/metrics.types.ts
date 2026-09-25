export interface DurationPercentiles {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface ActionMetrics {
  count: number;
  successes: number;
  failures: number;
  timeouts: number;
  retries: number;
  totalDurationMs: number;
  averageDurationMs: number;

  percentiles: DurationPercentiles;
}

export interface RpcMetricsSnapshot {
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  totalTimeouts: number;
  totalRetries: number;
  averageDurationMs: number;
  percentiles: DurationPercentiles;
  byAction: Record<string, ActionMetrics>;
}

export interface RpcMetricsOptions {
  maxDurationEntries?: number;

  durationsWindowMs?: number;

  onSnapshot?: (snapshot: RpcMetricsSnapshot) => void;
}
