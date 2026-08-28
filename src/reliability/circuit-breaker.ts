import type { CircuitBreakerOptions } from "@lizuz/mini-app-types";

export type { CircuitBreakerOptions };

type State = "closed" | "open" | "halfOpen";

interface Bucket {
  failures: number[];
  state: State;
  openedAt?: number;
}

export class CircuitBreaker {
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly openMs: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold ?? 5;
    this.windowMs = options.windowMs ?? 10_000;
    this.openMs = options.openMs ?? 30_000;
  }

  private key(ns: string, action: string): string {
    return `${ns}.${action}`;
  }

  private bucket(ns: string, action: string): Bucket {
    const k = this.key(ns, action);
    let b = this.buckets.get(k);
    if (!b) {
      b = { failures: [], state: "closed" };
      this.buckets.set(k, b);
    }
    return b;
  }

  shouldAllow(namespace: string, action: string): boolean {
    const b = this.bucket(namespace, action);
    if (b.state === "open") {
      if (b.openedAt && Date.now() - b.openedAt > this.openMs) {
        b.state = "halfOpen";
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(namespace: string, action: string): void {
    const b = this.bucket(namespace, action);
    b.failures = [];
    b.state = "closed";
    b.openedAt = undefined;
  }

  recordFailure(namespace: string, action: string): void {
    const b = this.bucket(namespace, action);
    const now = Date.now();
    b.failures = b.failures.filter((t) => now - t < this.windowMs);
    b.failures.push(now);
    if (b.state === "halfOpen") {
      b.state = "open";
      b.openedAt = now;
      return;
    }
    if (b.failures.length >= this.threshold) {
      b.state = "open";
      b.openedAt = now;
    }
  }

  getState(namespace: string, action: string): State {
    return this.bucket(namespace, action).state;
  }

  reset(namespace: string, action: string): void {
    this.buckets.delete(this.key(namespace, action));
  }
}
