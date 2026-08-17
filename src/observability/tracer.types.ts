/**
 * A single traced operation. The SDK starts one per interesting RPC phase
 * (handshake, request, stream) and annotates it as events happen; the tracer
 * implementation decides what `end()` means (submit to an OpenTelemetry
 * exporter, print, discard).
 */
export interface Span {
  readonly name: string;
  /** Marks the span as finished. The span is not usable afterwards. */
  end(): void;
  /** Records a key/value attribute. Values are tracer-defined; keep them small and serializable. */
  setAttribute(key: string, value: unknown): void;
}

/**
 * A minimal, SDK-shaped tracer interface. Deliberately tiny so an existing
 * tracer (OpenTelemetry, Datadog, ...) can be bridged with a thin adapter —
 * or so a host can implement one for its own backend without coupling the
 * SDK to a specific vendor.
 */
export interface Tracer {
  /**
   * Starts a span. `context` carries the request's `namespace`, `action`,
   * and the SDK instance's `traceId` so an adapter can connect spans to the
   * messages already stamped with that id on the wire.
   */
  startSpan(name: string, context?: Record<string, unknown>): Span;
}
