import { ACTIONS, HOST_TARGET, NAMESPACES, PROTOCOL_VERSION, SDK_CAPABILITIES } from '../constants';
import { HandshakeError, ProtocolError, TimeoutError } from '../errors';
import type { Logger } from '../logging';
import { noopLogger } from '../logging';
import { MetricsRecorder } from '../observability';
import type { RpcMetricsSnapshot } from '../observability';
import { createMessage, hasCompatibleMajorVersion, majorVersionsMatch } from '../protocol';
import type { HandshakeAckPayload, HandshakePayload, PlatformMessage } from '../protocol';
import type { Transport } from '../transport';
import { computeBackoffMs, delay, generateId } from '../utils';
import { composeMiddleware } from './middleware';
import type { RpcMiddleware } from './middleware';

export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

export interface RpcClientOptions {
  moduleId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Logger;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  namespace: string;
  action: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;

/**
 * The SDK package version reported during handshake. Kept separate from
 * `PROTOCOL_VERSION` because the *SDK* version and the *wire protocol*
 * version are conceptually different axes, even though they share a value
 * in this release.
 */
const RPC_CLIENT_SDK_VERSION = '3.0.0';

/**
 * Owns everything about *RPC semantics* as opposed to *message delivery*:
 * correlation ids, the pending-request map, timeout enforcement, retry
 * policy, the handshake sequence (including protocol version and
 * capability negotiation), and event subscription.
 *
 * `RpcClient` depends only on the `Transport` interface — it has no
 * knowledge of `postMessage`, `window`, or any other delivery mechanism.
 * SDK modules (`AuthModule`, `HttpModule`, ...) depend on `RpcClient`, not
 * on `Transport` directly.
 */
export class RpcClient {
  private readonly moduleId: string;
  private readonly timeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly logger: Logger;
  private readonly transport: Transport;

  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();
  private readonly middlewares: RpcMiddleware[] = [];
  private readonly metricsRecorder = new MetricsRecorder();
  private readonly traceId: string;
  private started = false;

  /**
   * Namespaces the host confirmed support for during the handshake. `null`
   * until `handshake()` resolves. Populated to `SDK_CAPABILITIES` verbatim
   * when a host doesn't report its own capabilities at all (an
   * not-yet-upgraded host), since the safest assumption in that case is
   * "everything this SDK build knows how to ask for is fair game", which
   * is exactly today's behavior for such a host.
   */
  private negotiatedCapabilities: string[] | null = null;

  constructor(transport: Transport, options: RpcClientOptions) {
    this.transport = transport;
    this.moduleId = options.moduleId;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.retryAttempts = options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.logger = options.logger ?? noopLogger;
    this.traceId = generateId();
  }

  /** Begin listening for inbound messages via the injected `Transport`. */
  start(): void {
    if (this.started) return;
    this.transport.start((message) => this.handleIncomingMessage(message));
    this.started = true;
  }

  /**
   * Stop listening and reject every in-flight request. Safe to call
   * multiple times and safe to call even if `start` was never called.
   */
  stop(): void {
    this.transport.stop();
    this.started = false;

    for (const [id, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(
        new ProtocolError({
          reason: 'malformed-message',
          message: `Request "${request.namespace}.${request.action}" was cancelled because the RPC client was stopped`,
        })
      );
      this.pending.delete(id);
    }

    this.eventHandlers.clear();
  }

  /**
   * Performs the initial handshake with the host: sends this SDK build's
   * protocol version and capability list, and waits for the host's
   * acknowledgement.
   *
   * A host that doesn't yet send an acknowledgement payload (an
   * un-upgraded host that just echoes `{ status: 'ok' }`) completes the
   * handshake exactly as before — every field on the ack is optional, and
   * missing fields fall back to permissive defaults. A host that *does*
   * report an incompatible protocol version, or that explicitly rejects
   * the connection, causes this to reject with a `HandshakeError` instead
   * of silently proceeding with a connection that won't actually work.
   */
  async handshake(): Promise<void> {
    const payload: HandshakePayload = {
      moduleId: this.moduleId,
      sdkVersion: RPC_CLIENT_SDK_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: SDK_CAPABILITIES,
    };

    const message = createMessage('handshake', NAMESPACES.HANDSHAKE, ACTIONS.HANDSHAKE.CONNECT, this.moduleId, HOST_TARGET, payload, {
      traceId: this.traceId,
    });

    return new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        rejectPromise(new HandshakeError({ message: 'Handshake with host timed out', timedOut: true }));
      }, this.timeout);

      this.pending.set(message.id, {
        resolve: (ackPayload) => this.completeHandshake(ackPayload, resolvePromise, rejectPromise),
        reject: (error) => rejectPromise(error instanceof HandshakeError ? error : new HandshakeError({ message: error.message, cause: error })),
        timer,
        namespace: NAMESPACES.HANDSHAKE,
        action: ACTIONS.HANDSHAKE.CONNECT,
      });

      this.sendOrFail(message, () => this.pending.delete(message.id));
    });
  }

  /**
   * Registers a middleware. Middlewares run in registration order (the
   * first registered is outermost) and wrap the entire request, including
   * its retry attempts — see `rpc/middleware.ts` for the execution model.
   * Safe to call after `start()`; a middleware registered mid-session
   * applies to every request made from that point on, not to ones already
   * in flight.
   */
  use(middleware: RpcMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Sends a request and resolves with the host's response payload. Passes
   * through any registered middleware, then through the retry loop
   * described on `executeWithRetry`.
   */
  async request<T>(namespace: string, action: string, payload?: unknown): Promise<T> {
    return composeMiddleware<T>(this.middlewares, { namespace, action, payload, attempt: 0 }, () =>
      this.executeWithRetry<T>(namespace, action, payload)
    );
  }

  /**
   * The actual retry loop: retryable failures (currently just
   * `TimeoutError`) are retried up to `retryAttempts` times, waiting an
   * exponentially increasing, jittered delay between attempts (see
   * `utils/backoff.ts`) so a burst of mini apps recovering from the same
   * host hiccup doesn't retry in lockstep. Every attempt — success or
   * failure — is recorded into `metricsRecorder`.
   */
  private async executeWithRetry<T>(namespace: string, action: string, payload?: unknown): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await this.sendRequest<T>(namespace, action, payload);
        this.metricsRecorder.recordSuccess(namespace, action, Date.now() - startedAt);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const wasTimeout = lastError instanceof TimeoutError;
        this.metricsRecorder.recordFailure(namespace, action, Date.now() - startedAt, wasTimeout);

        const retryable = 'retryable' in lastError ? Boolean((lastError as { retryable?: boolean }).retryable) : false;
        if (!retryable) throw lastError;
        if (attempt < this.retryAttempts) {
          this.metricsRecorder.recordRetry(namespace, action);
          await delay(computeBackoffMs(attempt, this.retryDelayMs, this.maxRetryDelayMs));
        }
      }
    }

    throw lastError ?? new ProtocolError({ reason: 'malformed-message', message: `Request "${namespace}.${action}" failed for an unknown reason` });
  }

  /**
   * Subscribes to a namespaced event. Returns an unsubscribe function.
   *
   * The first handler registered for a given event name triggers an
   * `event.subscribe` request to the host, telling it this mini app now
   * wants that event's data pushed to it — some hosts only start emitting
   * an event once they've received this. The subscribe call is
   * fire-and-forget: a host that doesn't require explicit subscription
   * simply ignores it.
   */
  onEvent<TPayload = unknown>(event: string, handler: EventHandler<TPayload>): () => void {
    const isFirstHandlerForEvent = !this.eventHandlers.has(event);
    if (isFirstHandlerForEvent) {
      this.eventHandlers.set(event, new Set());
      this.request(NAMESPACES.EVENT, ACTIONS.EVENT.SUBSCRIBE, { eventType: event }).catch((error: unknown) => {
        this.logger.warn(`Failed to subscribe to event "${event}"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    this.eventHandlers.get(event)!.add(handler as EventHandler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler as EventHandler);
    };
  }

  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Namespaces the host confirmed support for. Returns an empty array
   * before `handshake()` resolves — callers that need to feature-detect
   * before `initialize()` completes should just wait for `initialize()`.
   */
  getCapabilities(): readonly string[] {
    return this.negotiatedCapabilities ?? [];
  }

  /**
   * A point-in-time snapshot of every request this client has made:
   * totals plus a per-`namespace.action` breakdown of counts, timings,
   * failures, timeouts, and retries. Safe to call at any time, including
   * before `start()` (it just reports all zeros).
   */
  getMetrics(): RpcMetricsSnapshot {
    return this.metricsRecorder.snapshot();
  }

  private completeHandshake(ackPayload: unknown, resolvePromise: () => void, rejectPromise: (error: Error) => void): void {
    const ack = (ackPayload && typeof ackPayload === 'object' ? ackPayload : {}) as HandshakeAckPayload;

    if (ack.status === 'rejected') {
      rejectPromise(new HandshakeError({ message: ack.reason ?? 'Host rejected the handshake request' }));
      return;
    }

    if (ack.protocolVersion && !majorVersionsMatch(ack.protocolVersion, PROTOCOL_VERSION)) {
      rejectPromise(
        new HandshakeError({
          message: `Host protocol version "${ack.protocolVersion}" is incompatible with this SDK's protocol version "${PROTOCOL_VERSION}" (major version mismatch)`,
        })
      );
      return;
    }

    if (ack.capabilities) {
      this.negotiatedCapabilities = SDK_CAPABILITIES.filter((capability) => ack.capabilities!.includes(capability));
      this.logger.debug('Negotiated capabilities with host', { capabilities: this.negotiatedCapabilities });
    } else {
      this.negotiatedCapabilities = [...SDK_CAPABILITIES];
      this.logger.debug('Host did not report capabilities during handshake; assuming full support', {
        assumed: this.negotiatedCapabilities,
      });
    }

    resolvePromise();
  }

  private sendRequest<T>(namespace: string, action: string, payload?: unknown): Promise<T> {
    const message = createMessage('request', namespace, action, this.moduleId, HOST_TARGET, payload, {
      traceId: this.traceId,
    });

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new TimeoutError({ namespace, action, timeoutMs: this.timeout }));
      }, this.timeout);

      this.pending.set(message.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        namespace,
        action,
      });

      this.sendOrFail(message, () => this.pending.delete(message.id));
    });
  }

  private sendOrFail(message: PlatformMessage, onFailure: () => void): void {
    try {
      this.transport.send(message);
    } catch (error) {
      const pending = this.pending.get(message.id);
      onFailure();
      const err = error instanceof Error ? error : new Error(String(error));
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
    }
  }

  private handleIncomingMessage(message: PlatformMessage): void {
    if (message.target !== this.moduleId && message.target !== '*') return;

    if (!hasCompatibleMajorVersion(message)) {
      this.logger.warn('Dropped message with an incompatible protocol major version', {
        received: message.version,
        expected: PROTOCOL_VERSION,
        namespace: message.namespace,
        action: message.action,
      });
      return;
    }

    if (message.type === 'response' || message.type === 'handshake') {
      const pending = this.pending.get(message.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new ProtocolError({ reason: 'host-rejected', platformError: message.error }));
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    if (message.type === 'event') {
      const key = `${message.namespace}.${message.action}`;
      const handlers = this.eventHandlers.get(key);
      handlers?.forEach((handler) => handler(message.payload));
    }
  }
}
