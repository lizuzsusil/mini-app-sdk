import type { Span, Tracer } from "./tracer.types";

export class NoopSpan implements Span {
  constructor(readonly name: string) {}
  end(): void {}
  setAttribute(): void {}
}

export const noopTracer: Tracer = {
  startSpan(name: string): Span {
    return new NoopSpan(name);
  },
};
