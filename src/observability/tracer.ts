import type { Span, Tracer } from "./tracer.types";

/**
 * Default `Span` used when no tracer is supplied: accepts every call and does
 * nothing. Kept so the `RpcClient` hot path never branches on whether tracing
 * is enabled.
 */
export class NoopSpan implements Span {
  constructor(readonly name: string) {}
  end(): void {}
  setAttribute(): void {}
}

/**
 * The default `Tracer`: starts `NoopSpan`s, so an SDK that isn't given a
 * tracer behaves exactly as it always has — no allocation of real spans, no
 * behavior change.
 */
export const noopTracer: Tracer = {
  startSpan(name: string): Span {
    return new NoopSpan(name);
  },
};
