import { describe, expect, it } from "vitest";
import { computeBackoffMs } from "./backoff";

describe("computeBackoffMs", () => {
  it("grows exponentially with the attempt number, before capping", () => {
    const base = 100;
    const max = 10_000;

    const attempt0 = computeBackoffMs(0, base, max);
    const attempt1 = computeBackoffMs(1, base, max);
    const attempt2 = computeBackoffMs(2, base, max);

    // jitter adds up to 30% on top, so compare floors rather than exact values
    expect(attempt0).toBeGreaterThanOrEqual(100);
    expect(attempt0).toBeLessThan(100 * 1.3 + 1);

    expect(attempt1).toBeGreaterThanOrEqual(200);
    expect(attempt1).toBeLessThan(200 * 1.3 + 1);

    expect(attempt2).toBeGreaterThanOrEqual(400);
    expect(attempt2).toBeLessThan(400 * 1.3 + 1);
  });

  it("never exceeds maxMs, even including jitter", () => {
    const base = 1000;
    const max = 2000;

    for (let attempt = 0; attempt < 10; attempt++) {
      const value = computeBackoffMs(attempt, base, max);
      expect(value).toBeLessThanOrEqual(max * 1.3 + 1);
    }
  });

  it("produces different values across repeated calls (jitter is actually random)", () => {
    const values = new Set(
      Array.from({ length: 20 }, () => computeBackoffMs(3, 200, 10_000)),
    );
    expect(values.size).toBeGreaterThan(1);
  });
});
