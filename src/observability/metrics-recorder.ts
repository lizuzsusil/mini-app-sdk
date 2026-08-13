import type {
  ActionMetrics,
  DurationPercentiles,
  RpcMetricsOptions,
  RpcMetricsSnapshot,
} from "./metrics.types";

const DEFAULT_MAX_DURATION_ENTRIES = 100;

interface DurationSample {
  at: number;
  durationMs: number;
}

function emptyActionMetrics(): ActionMetrics {
  return {
    count: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    retries: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
    percentiles: emptyPercentiles(),
  };
}

function emptyPercentiles(): DurationPercentiles {
  return { p50Ms: 0, p95Ms: 0, p99Ms: 0 };
}

function percentile(sortedValues: number[], p: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  const index = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sortedValues[index];
}

function computePercentiles(samples: DurationSample[]): DurationPercentiles {
  if (samples.length === 0) return emptyPercentiles();
  const values = samples
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  return {
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
  };
}

/**
 * Records what happens to every request that passes through `RpcClient`,
 * broken down per `namespace.action`. This is deliberately in-memory,
 * process-local, and answers "what has this SDK instance seen so far", not
 * a long-term metrics store. A host or mini app that wants durable metrics
 * reads a snapshot periodically (via `sdk.getMetrics()`) and ships it
 * wherever it needs to go; `MetricsRecorder` itself never makes a network
 * call.
 *
 * Counters are cumulative, but latency percentiles come from a bounded
 * window of recent durations (see `RpcMetricsOptions`) so long-running
 * mini apps stay memory-bounded and the p99 reflects recent behavior.
 */
export class MetricsRecorder {
  private readonly maxDurationEntries: number;
  private readonly durationsWindowMs: number | undefined;
  private readonly onSnapshot: RpcMetricsOptions["onSnapshot"];

  private readonly actions = new Map<string, ActionMetrics>();
  private readonly durationSamples = new Map<string, DurationSample[]>();

  constructor(options: RpcMetricsOptions = {}) {
    this.maxDurationEntries =
      options.maxDurationEntries ?? DEFAULT_MAX_DURATION_ENTRIES;
    this.durationsWindowMs = options.durationsWindowMs;
    this.onSnapshot = options.onSnapshot;
  }

  recordSuccess(namespace: string, action: string, durationMs: number): void {
    const metrics = this.getOrCreate(namespace, action);
    metrics.count += 1;
    metrics.successes += 1;
    metrics.totalDurationMs += durationMs;
    metrics.averageDurationMs = metrics.totalDurationMs / metrics.count;
    this.recordDuration(namespace, action, durationMs);
  }

  recordFailure(
    namespace: string,
    action: string,
    durationMs: number,
    wasTimeout: boolean,
  ): void {
    const metrics = this.getOrCreate(namespace, action);
    metrics.count += 1;
    metrics.failures += 1;
    if (wasTimeout) metrics.timeouts += 1;
    metrics.totalDurationMs += durationMs;
    metrics.averageDurationMs = metrics.totalDurationMs / metrics.count;
    this.recordDuration(namespace, action, durationMs);
  }

  recordRetry(namespace: string, action: string): void {
    const metrics = this.getOrCreate(namespace, action);
    metrics.retries += 1;
  }

  snapshot(): RpcMetricsSnapshot {
    const byAction: Record<string, ActionMetrics> = {};
    let totalRequests = 0;
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalTimeouts = 0;
    let totalRetries = 0;
    let totalDurationMs = 0;
    const allSamples: DurationSample[] = [];

    const now = Date.now();
    for (const [key, metrics] of this.actions) {
      const window = this.samplesWithinWindow(key, now);
      byAction[key] = {
        ...metrics,
        percentiles: computePercentiles(window),
      };
      totalRequests += metrics.count;
      totalSuccesses += metrics.successes;
      totalFailures += metrics.failures;
      totalTimeouts += metrics.timeouts;
      totalRetries += metrics.retries;
      totalDurationMs += metrics.totalDurationMs;
      allSamples.push(...window);
    }

    const snapshot: RpcMetricsSnapshot = {
      totalRequests,
      totalSuccesses,
      totalFailures,
      totalTimeouts,
      totalRetries,
      averageDurationMs:
        totalRequests > 0 ? totalDurationMs / totalRequests : 0,
      percentiles: computePercentiles(allSamples),
      byAction,
    };

    try {
      this.onSnapshot?.(snapshot);
    } catch {
      // A host's snapshot hook must never break metric reads.
    }

    return snapshot;
  }

  reset(): void {
    this.actions.clear();
    this.durationSamples.clear();
  }

  private recordDuration(
    namespace: string,
    action: string,
    durationMs: number,
  ): void {
    const key = `${namespace}.${action}`;
    const samples = this.durationSamples.get(key) ?? [];
    samples.push({ at: Date.now(), durationMs });
    if (samples.length > this.maxDurationEntries) samples.shift();
    this.durationSamples.set(key, samples);
  }

  /** The bounded, age-windowed duration samples for one action. */
  private samplesWithinWindow(key: string, now: number): DurationSample[] {
    const samples = this.durationSamples.get(key);
    if (!samples) return [];
    if (this.durationsWindowMs === undefined) return samples;
    const cutoff = now - this.durationsWindowMs;
    const window = samples.filter((sample) => sample.at >= cutoff);
    // Opportunistically drop aged-out samples so the array stays tight.
    if (window.length !== samples.length) this.durationSamples.set(key, window);
    return window;
  }

  private getOrCreate(namespace: string, action: string): ActionMetrics {
    const key = `${namespace}.${action}`;
    let metrics = this.actions.get(key);
    if (!metrics) {
      metrics = emptyActionMetrics();
      this.actions.set(key, metrics);
    }
    return metrics;
  }
}
