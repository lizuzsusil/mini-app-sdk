import { describe, expect, it } from 'vitest';
import { MetricsRecorder } from './metrics-recorder';

describe('MetricsRecorder', () => {
  it('starts with an all-zero snapshot', () => {
    const recorder = new MetricsRecorder();
    expect(recorder.snapshot()).toEqual({
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalTimeouts: 0,
      totalRetries: 0,
      averageDurationMs: 0,
      byAction: {},
    });
  });

  it('records a success under its namespace.action key', () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess('auth', 'getUser', 120);

    const snapshot = recorder.snapshot();
    expect(snapshot.totalRequests).toBe(1);
    expect(snapshot.totalSuccesses).toBe(1);
    expect(snapshot.byAction['auth.getUser']).toMatchObject({ count: 1, successes: 1, averageDurationMs: 120 });
  });

  it('records failures and timeouts separately', () => {
    const recorder = new MetricsRecorder();
    recorder.recordFailure('device', 'camera', 50, true);
    recorder.recordFailure('device', 'camera', 30, false);

    const snapshot = recorder.snapshot();
    expect(snapshot.byAction['device.camera']).toMatchObject({ count: 2, failures: 2, timeouts: 1 });
  });

  it('computes a running average duration per action', () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess('http', 'get', 100);
    recorder.recordSuccess('http', 'get', 200);

    expect(recorder.snapshot().byAction['http.get']!.averageDurationMs).toBe(150);
  });

  it('aggregates totals across multiple actions', () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess('auth', 'getUser', 100);
    recorder.recordSuccess('http', 'get', 300);
    recorder.recordFailure('device', 'camera', 50, true);

    const snapshot = recorder.snapshot();
    expect(snapshot.totalRequests).toBe(3);
    expect(snapshot.totalSuccesses).toBe(2);
    expect(snapshot.totalFailures).toBe(1);
    expect(snapshot.totalTimeouts).toBe(1);
    expect(snapshot.averageDurationMs).toBeCloseTo(150, 5);
  });

  it('tracks retries separately from failures', () => {
    const recorder = new MetricsRecorder();
    recorder.recordRetry('auth', 'getUser');
    recorder.recordRetry('auth', 'getUser');

    expect(recorder.snapshot().byAction['auth.getUser']!.retries).toBe(2);
    expect(recorder.snapshot().totalRetries).toBe(2);
  });

  it('reset() clears everything', () => {
    const recorder = new MetricsRecorder();
    recorder.recordSuccess('auth', 'getUser', 100);
    recorder.reset();

    expect(recorder.snapshot()).toEqual({
      totalRequests: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      totalTimeouts: 0,
      totalRetries: 0,
      averageDurationMs: 0,
      byAction: {},
    });
  });
});
