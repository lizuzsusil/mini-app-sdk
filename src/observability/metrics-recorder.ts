import type { ActionMetrics, RpcMetricsSnapshot } from "./metrics.types";

function emptyActionMetrics(): ActionMetrics {
  return {
    count: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    retries: 0,
    totalDurationMs: 0,
    averageDurationMs: 0,
  };
}

/**
 * Records what happens to every request that passes through `RpcClient`,
 * broken down per `namespace.action`. This is deliberately in-memory,
 * unbounded-by-time, and process-local — it answers "what has this SDK
 * instance seen so far", not a long-term metrics store. A host or mini app
 * that wants durable metrics reads a snapshot periodically (via
 * `sdk.getMetrics()`) and ships it wherever it needs to go; `MetricsRecorder`
 * itself never makes a network call.
 */
export class MetricsRecorder {
  private readonly actions = new Map<string, ActionMetrics>();

  recordSuccess(namespace: string, action: string, durationMs: number): void {
    const metrics = this.getOrCreate(namespace, action);
    metrics.count += 1;
    metrics.successes += 1;
    metrics.totalDurationMs += durationMs;
    metrics.averageDurationMs = metrics.totalDurationMs / metrics.count;
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

    for (const [key, metrics] of this.actions) {
      byAction[key] = { ...metrics };
      totalRequests += metrics.count;
      totalSuccesses += metrics.successes;
      totalFailures += metrics.failures;
      totalTimeouts += metrics.timeouts;
      totalRetries += metrics.retries;
      totalDurationMs += metrics.totalDurationMs;
    }

    return {
      totalRequests,
      totalSuccesses,
      totalFailures,
      totalTimeouts,
      totalRetries,
      averageDurationMs:
        totalRequests > 0 ? totalDurationMs / totalRequests : 0,
      byAction,
    };
  }

  reset(): void {
    this.actions.clear();
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
