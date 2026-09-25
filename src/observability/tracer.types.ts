export interface Span {
  readonly name: string;
  end(): void;
  setAttribute(key: string, value: unknown): void;
}

export interface Tracer {
  startSpan(name: string, context?: Record<string, unknown>): Span;
}
