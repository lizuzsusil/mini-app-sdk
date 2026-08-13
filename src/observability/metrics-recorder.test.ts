import { describe, expect, it, vi } from "vitest";
import { MetricsRecorder } from "./metrics-recorder";

const ZERO_SNAPSHOT = {
  totalRequests: 0,
  totalSuccesses: 0,
  totalFailures: 0,
  totalTimeouts: 0,
  totalRetries: 0,
  averageDurationMs: 0,
  percentiles: { p50Ms: 0, p95Ms: 0, p99Ms: 0 },
  byAction: {},
};

describe("MetricsRecorder", () => {
  it("starts with an all-zero snapshot", () => {
    const recorder = new MetricsRecorder();
    expect(recorder.snapshot()).toEqual(ZERO_SNAPSHOT);
  });

  it("records a success under its namespace.action key", () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess("auth", "getUser", 120);

    const snapshot = recorder.snapshot();
    expect(snapshot.totalRequests).toBe(1);
    expect(snapshot.totalSuccesses).toBe(1);
    expect(snapshot.byAction["auth.getUser"]).toMatchObject({
      count: 1,
      successes: 1,
      averageDurationMs: 120,
    });
  });

  it("records failures and timeouts separately", () => {
    const recorder = new MetricsRecorder();
    recorder.recordFailure("device", "camera", 50, true);
    recorder.recordFailure("device", "camera", 30, false);

    const snapshot = recorder.snapshot();
    expect(snapshot.byAction["device.camera"]).toMatchObject({
      count: 2,
      failures: 2,
      timeouts: 1,
    });
  });

  it("computes a running average duration per action", () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess("http", "get", 100);
    recorder.recordSuccess("http", "get", 200);

    expect(recorder.snapshot().byAction["http.get"]!.averageDurationMs).toBe(
      150,
    );
  });

  it("aggregates totals across multiple actions", () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess("auth", "getUser", 100);
    recorder.recordSuccess("http", "get", 300);
    recorder.recordFailure("device", "camera", 50, true);

    const snapshot = recorder.snapshot();
    expect(snapshot.totalRequests).toBe(3);
    expect(snapshot.totalSuccesses).toBe(2);
    expect(snapshot.totalFailures).toBe(1);
    expect(snapshot.totalTimeouts).toBe(1);
    expect(snapshot.averageDurationMs).toBeCloseTo(150, 5);
  });

  it("tracks retries separately from failures", () => {
    const recorder = new MetricsRecorder();
    recorder.recordRetry("auth", "getUser");
    recorder.recordRetry("auth", "getUser");

    expect(recorder.snapshot().byAction["auth.getUser"]!.retries).toBe(2);
    expect(recorder.snapshot().totalRetries).toBe(2);
  });

  it("reset() clears everything", () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess("auth", "getUser", 100);
    recorder.reset();

    expect(recorder.snapshot()).toEqual(ZERO_SNAPSHOT);
  });

  it("computes p50/p95/p99 from the recent duration window", () => {
    const recorder = new MetricsRecorder();
    for (const ms of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      recorder.recordSuccess("auth", "getUser", ms);
    }

    const metrics = recorder.snapshot().byAction["auth.getUser"]!;
    expect(metrics.percentiles.p50Ms).toBe(50);
    expect(metrics.percentiles.p95Ms).toBe(100);
    expect(metrics.percentiles.p99Ms).toBe(100);
  });

  it("computes overall percentiles across all actions", () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess("auth", "getUser", 10);
    recorder.recordSuccess("auth", "getUser", 90);
    recorder.recordSuccess("http", "get", 50);

    const snapshot = recorder.snapshot();
    expect(snapshot.percentiles.p50Ms).toBe(50);
    expect(snapshot.percentiles.p95Ms).toBe(90);
  });

  it("bounds the duration window by maxDurationEntries", () => {
    const recorder = new MetricsRecorder({ maxDurationEntries: 3 });
    for (const ms of [1, 2, 3, 4, 5]) {
      recorder.recordSuccess("auth", "getUser", ms);
    }

    const metrics = recorder.snapshot().byAction["auth.getUser"]!;
    // The three most recent durations are 3, 4, 5.
    expect(metrics.percentiles.p50Ms).toBe(4);
    expect(metrics.percentiles.p99Ms).toBe(5);
    // Counters remain cumulative and are unaffected by the window bound.
    expect(metrics.count).toBe(5);
  });

  it("excludes durations older than durationsWindowMs from percentiles", () => {
    vi.useFakeTimers();
    try {
      const recorder = new MetricsRecorder({ durationsWindowMs: 1000 });
      recorder.recordSuccess("auth", "getUser", 10);
      vi.advanceTimersByTime(2000);
      recorder.recordSuccess("auth", "getUser", 200);

      const metrics = recorder.snapshot().byAction["auth.getUser"]!;
      // The 10ms sample aged out; only the 200ms one remains.
      expect(metrics.percentiles.p50Ms).toBe(200);
      // Counters still count both.
      expect(metrics.count).toBe(2);
      expect(metrics.averageDurationMs).toBe(105);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invokes the onSnapshot export hook with every computed snapshot", () => {
    const onSnapshot = vi.fn();
    const recorder = new MetricsRecorder({ onSnapshot });
    recorder.recordSuccess("auth", "getUser", 100);

    const snapshot = recorder.snapshot();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it("never lets a throwing onSnapshot hook break snapshot()", () => {
    const onSnapshot = vi.fn(() => {
      throw new Error("persist failed");
    });
    const recorder = new MetricsRecorder({ onSnapshot });
    recorder.recordSuccess("auth", "getUser", 100);

    expect(() => recorder.snapshot()).not.toThrow();
  });
});
