import type { RpcMetricsSnapshot } from "../observability";

/**
 * EMA-based adaptive timeout. Consumes metrics snapshots and proposes a
 * timeout as `p95 * factor` clamped between min/max. Opt-in via
 * `reliability.adaptiveTimeout`.
 */
export class AdaptiveTimeout {
  private emaP95 = 0;
  private readonly alpha: number;
  private readonly factor: number;
  private readonly minMs: number;
  private readonly maxMs: number;

  constructor(
    options: {
      alpha?: number;
      factor?: number;
      minMs?: number;
      maxMs?: number;
    } = {},
  ) {
    this.alpha = options.alpha ?? 0.3;
    this.factor = options.factor ?? 1.5;
    this.minMs = options.minMs ?? 1000;
    this.maxMs = options.maxMs ?? 15000;
  }

  observe(snapshot: RpcMetricsSnapshot): void {
    const p95 = snapshot.percentiles.p95Ms || snapshot.averageDurationMs || 0;
    if (p95 <= 0) return;
    if (this.emaP95 === 0) this.emaP95 = p95;
    else this.emaP95 = this.alpha * p95 + (1 - this.alpha) * this.emaP95;
  }

  propose(): number {
    if (this.emaP95 === 0) return this.maxMs;
    const v = Math.round(this.emaP95 * this.factor);
    return Math.min(this.maxMs, Math.max(this.minMs, v));
  }

  getEma(): number {
    return this.emaP95;
  }
}
