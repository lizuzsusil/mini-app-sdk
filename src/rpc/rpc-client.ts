import {
  ACTIONS,
  CONNECTION_EVENTS,
  HOST_TARGET,
  NAMESPACES,
  PROTOCOL_VERSION,
  SDK_CAPABILITIES,
} from "../constants";
import {
  HandshakeError,
  ProtocolError,
  RequestCancelledError,
  TimeoutError,
} from "../errors";
import type { Logger } from "../logging";
import { noopLogger } from "../logging";
import type { RpcMetricsOptions, RpcMetricsSnapshot } from "../observability";
import { MetricsRecorder } from "../observability";
import type {
  HandshakeAckPayload,
  HandshakePayload,
  PlatformMessage,
} from "../protocol";
import {
  createMessage,
  hasCompatibleMajorVersion,
  majorVersionsMatch,
} from "../protocol";
import { StreamBuilder } from "../stream";
import type { Transport, TransportDebugInfo } from "../transport";
import type {
  HeartbeatOptions,
  OnEventOptions,
  PendingRequestInfo,
} from "../types";
import { computeBackoffMs, delay, generateId } from "../utils";
import type { RpcMiddleware } from "./middleware";
import { composeMiddleware } from "./middleware";

export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

/** Per-request control knobs passed to `request()`. */
export interface RpcRequestOptions {
  /**
   * When provided, aborting the signal rejects the in-flight request (and any
   * pending retries) with a `RequestCancelledError` — useful for unmounting
   * screens or navigating away without waiting for the timeout.
   */
  signal?: AbortSignal;
}

/** Per-stream control knobs passed to `sendStreamRequest()`. */
export interface RpcStreamOptions {
  /**
   * When provided, aborting the signal cancels the stream (rejecting the
   * `StreamBuilder` with a `RequestCancelledError`) and notifies the host to
   * stop producing.
   */
  signal?: AbortSignal;
}

export interface RpcClientOptions {
  miniAppId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Logger;
  /**
   * When true, warns once per `namespace.action` about requests to domain
   * namespaces the host did not negotiate during the handshake. No-op when
   * false (production). Defaults to false.
   */
  devMode?: boolean;
  /** Enables the optional heartbeat & reconnect (see `HeartbeatOptions`). */
  heartbeat?: HeartbeatOptions;
  /** Tuning for the request metrics recorder (percentile window, export hook). */
  metrics?: RpcMetricsOptions;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  namespace: string;
  action: string;
  /** `Date.now()` when the request was dispatched, for debug snapshots. */
  startedAt: number;
}

/** Metadata the RPC layer keeps per active streamed request. */
interface StreamRecord {
  builder: StreamBuilder;
  namespace: string;
  action: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_MISSED_PONGS = 2;

/** How many recent payloads per event the replay buffer retains. */
const EVENT_REPLAY_BUFFER_SIZE = 5;

/**
 * The SDK package version reported during handshake. Kept separate from
 * `PROTOCOL_VERSION` because the *SDK* version and the *wire protocol*
 * version are conceptually different axes, even though they share a value
 * in this release.
 */
const RPC_CLIENT_SDK_VERSION = "3.0.0";

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
  private readonly miniAppId: string;
  private readonly timeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly logger: Logger;
  private readonly devMode: boolean;
  private readonly transport: Transport;
  private readonly heartbeatOptions: HeartbeatOptions | null;

  private readonly pending = new Map<string, PendingRequest>();
  private readonly eventHandlers = new Map<string, Set<EventHandler>>();
  private readonly streamConsumers = new Map<string, StreamRecord>();
  private readonly middlewares: RpcMiddleware[] = [];
  private readonly metricsRecorder: MetricsRecorder;
  private readonly warnedUnavailableCapabilities = new Set<string>();
  private readonly traceId: string;
  private started = false;

  /** Set while a reconnect (re-run of the handshake) is in progress. */
  private reconnectInProgress = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatMissedPongs = 0;
  /** Heartbeat pings awaiting a pong, keyed by requestId. */
  private readonly heartbeatPings = new Map<
    string,
    { onPong: () => void; timer: ReturnType<typeof setTimeout> }
  >();

  /**
   * Bounded per-event buffer of recent payloads, for `onEvent()` subscriptions
   * that pass the `replay` option. New subscribers receive the buffered values
   * immediately so a slow mount doesn't lose events that arrived before it
   * subscribed.
   */
  private readonly eventReplayBuffer = new Map<string, unknown[]>();

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
    this.miniAppId = options.miniAppId;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.retryAttempts = options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.maxRetryDelayMs =
      options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.logger = options.logger ?? noopLogger;
    this.devMode = options.devMode ?? false;
    this.heartbeatOptions = options.heartbeat ?? null;
    this.metricsRecorder = new MetricsRecorder(options.metrics);
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
    this.reconnectInProgress = false;
    this.stopHeartbeat();

    for (const [id, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(
        new ProtocolError({
          reason: "malformed-message",
          message: `Request "${request.namespace}.${request.action}" was cancelled because the RPC client was stopped`,
        }),
      );
      this.pending.delete(id);
    }

    for (const [, stream] of this.streamConsumers) {
      stream.builder.rejectChunk(
        new ProtocolError({
          reason: "malformed-message",
          message:
            "The stream was cancelled because the RPC client was stopped",
        }),
      );
    }
    this.streamConsumers.clear();

    this.eventHandlers.clear();
    this.eventReplayBuffer.clear();
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
      miniAppId: this.miniAppId,
      sdkVersion: RPC_CLIENT_SDK_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: SDK_CAPABILITIES,
    };

    const message = createMessage(
      "handshake",
      NAMESPACES.HANDSHAKE,
      ACTIONS.HANDSHAKE.CONNECT,
      this.miniAppId,
      HOST_TARGET,
      payload,
      {
        traceId: this.traceId,
      },
    );

    return new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.requestId);
        rejectPromise(
          new HandshakeError({
            message: "Handshake with host timed out",
            timedOut: true,
          }),
        );
      }, this.timeout);

      this.pending.set(message.requestId, {
        resolve: (ackPayload) =>
          this.completeHandshake(ackPayload, resolvePromise, rejectPromise),
        reject: (error) =>
          rejectPromise(
            error instanceof HandshakeError
              ? error
              : new HandshakeError({ message: error.message, cause: error }),
          ),
        timer,
        namespace: NAMESPACES.HANDSHAKE,
        action: ACTIONS.HANDSHAKE.CONNECT,
        startedAt: Date.now(),
      });

      this.sendOrFail(message, () => this.pending.delete(message.requestId));
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
   * described on `executeWithRetry`. An optional `AbortSignal` in `options`
   * cancels the request (including any queued retries) with a
   * `RequestCancelledError` as soon as it fires.
   */
  async request<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<T> {
    this.warnOnUnavailableCapability(namespace, action);
    return composeMiddleware<T>(
      this.middlewares,
      { namespace, action, payload, attempt: 0 },
      () =>
        this.executeWithRetry<T>(namespace, action, payload, options?.signal),
    );
  }

  /**
   * Dev-mode helper: once the handshake has completed, warn once per
   * `namespace.action` when the namespace is a domain capability this SDK
   * advertises but the host did not negotiate. Protocol-level namespaces
   * (`event`, `handshake`) are excluded — hosts never negotiate them, so a
   * warning would be noise. A no-op when `devMode` is off.
   */
  private warnOnUnavailableCapability(namespace: string, action: string): void {
    if (!this.devMode) return;
    if (!this.negotiatedCapabilities) return;
    if (!SDK_CAPABILITIES.includes(namespace)) return;
    if (this.negotiatedCapabilities.includes(namespace)) return;

    const key = `${namespace}.${action}`;
    if (this.warnedUnavailableCapabilities.has(key)) return;
    this.warnedUnavailableCapabilities.add(key);
    this.logger.warn(
      `[dev] "${key}" requires the "${namespace}" capability, but the host did not negotiate it — the request will likely fail`,
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
  private async executeWithRetry<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      if (signal?.aborted) {
        throw new RequestCancelledError({
          namespace,
          action,
          cause: signal.reason,
        });
      }

      const startedAt = Date.now();
      try {
        const result = await this.sendRequest<T>(
          namespace,
          action,
          payload,
          signal,
        );
        this.metricsRecorder.recordSuccess(
          namespace,
          action,
          Date.now() - startedAt,
        );
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const wasTimeout = lastError instanceof TimeoutError;
        this.metricsRecorder.recordFailure(
          namespace,
          action,
          Date.now() - startedAt,
          wasTimeout,
        );

        const retryable =
          "retryable" in lastError
            ? Boolean((lastError as { retryable?: boolean }).retryable)
            : false;
        if (!retryable) throw lastError;
        if (attempt < this.retryAttempts) {
          this.metricsRecorder.recordRetry(namespace, action);
          await this.abortAwareDelay(
            computeBackoffMs(attempt, this.retryDelayMs, this.maxRetryDelayMs),
            namespace,
            action,
            signal,
          );
        }
      }
    }

    throw (
      lastError ??
      new ProtocolError({
        reason: "malformed-message",
        message: `Request "${namespace}.${action}" failed for an unknown reason`,
      })
    );
  }

  /**
   * Delays while watching an `AbortSignal`: aborts reject early with a
   * `RequestCancelledError` instead of letting the caller wait out a backoff
   * that no longer matters.
   */
  private async abortAwareDelay(
    ms: number,
    namespace: string,
    action: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!signal) {
      await delay(ms);
      return;
    }
    if (signal.aborted) {
      throw new RequestCancelledError({
        namespace,
        action,
        cause: signal.reason,
      });
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(
            new RequestCancelledError({
              namespace,
              action,
              cause: signal.reason,
            }),
          );
        },
        { once: true },
      );
    });
  }

  /**
   * Sends a request whose response the host streams back as a sequence of
   * `stream` messages. Resolves with a `StreamBuilder` immediately — the
   * first chunk may arrive before this promise settles — which callers
   * consume via `builder.iterate()` (per-chunk) or `builder.waitUntilDone()`
   * (whole-stream completion). See `stream/StreamBuilder.ts`.
   *
   * Streams deliberately bypass the middleware and retry machinery: a
   * stream may already have produced output by the time a failure would be
   * detected, so an automatic retry can't be spliced in safely. A timeout
   * still applies, matching every other request.
   *
   * An optional `AbortSignal` in `options` cancels the stream: the builder
   * rejects with a `RequestCancelledError` and the host is told to stop
   * producing. A mini app can also cancel directly via `builder.cancel()`,
   * which notifies the host the same way.
   */
  async sendStreamRequest(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcStreamOptions,
  ): Promise<StreamBuilder> {
    const message = createMessage(
      "request",
      namespace,
      action,
      this.miniAppId,
      HOST_TARGET,
      payload,
      {
        traceId: this.traceId,
      },
    );

    const builder = new StreamBuilder();
    const signal = options?.signal;
    this.streamConsumers.set(message.requestId, { builder, namespace, action });
    builder.onCancel = () => this.notifyHostStreamCancelled(message.requestId);

    const onAbort = (): void => {
      this.cancelStreamBuilder(
        message.requestId,
        new RequestCancelledError({
          namespace,
          action,
          cause: signal?.reason,
        }),
      );
    };

    const timer = setTimeout(() => {
      this.streamConsumers.delete(message.requestId);
      builder.rejectChunk(
        new TimeoutError({ namespace, action, timeoutMs: this.timeout }),
      );
    }, this.timeout);

    const cleanup = (): void => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      this.streamConsumers.delete(message.requestId);
    };

    try {
      this.transport.send(message);
    } catch (error) {
      cleanup();
      builder.rejectChunk(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    builder.waitUntilDone().then(cleanup, cleanup);

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    return builder;
  }

  /**
   * Explicitly cancels an active streamed request by its `requestId`,
   * rejecting its builder and notifying the host to stop producing. No-op if
   * the stream already settled. The RPC layer owns cancellation semantics —
   * the `StreamBuilder` itself stays transport-agnostic.
   */
  cancelStream(requestId: string): void {
    const record = this.streamConsumers.get(requestId);
    if (!record) return;
    this.cancelStreamBuilder(requestId);
  }

  /**
   * Rejects a stream's builder with the given error (defaulting to a
   * `StreamCancelledError`), also firing the builder's `onCancel` hook so the
   * host is told to stop. `onAbort` uses this for the signal path.
   */
  private cancelStreamBuilder(requestId: string, error?: Error): void {
    this.streamConsumers.get(requestId)?.builder.cancel(error);
  }

  /**
   * Fire-and-forget host notification that a stream is being cancelled, so
   * the host can stop generating chunks instead of streaming into the void.
   */
  private notifyHostStreamCancelled(requestId: string): void {
    const record = this.streamConsumers.get(requestId);
    if (!record) return;
    this.request<unknown>(record.namespace, ACTIONS.AI.CANCEL, {
      requestId,
    }).catch((error: unknown) => {
      this.logger.warn(
        `Failed to notify the host that stream "${requestId}" was cancelled`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    });
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
   *
   * With `{ replay: true }`, the handler is immediately invoked with the
   * last few payloads this client has already seen for that event (a small
   * bounded buffer, kept per event name), so a handler registered after the
   * host started emitting still observes the most recent value rather than
   * only future changes.
   */
  onEvent<TPayload = unknown>(
    event: string,
    handler: EventHandler<TPayload>,
    options?: OnEventOptions,
  ): () => void {
    const isFirstHandlerForEvent = !this.eventHandlers.has(event);
    if (isFirstHandlerForEvent) {
      this.eventHandlers.set(event, new Set());
      this.request(NAMESPACES.EVENT, ACTIONS.EVENT.SUBSCRIBE, {
        eventType: event,
      }).catch((error: unknown) => {
        this.logger.warn(`Failed to subscribe to event "${event}"`, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    this.eventHandlers.get(event)?.add(handler as EventHandler);

    if (options?.replay) {
      for (const payload of this.eventReplayBuffer.get(event) ?? []) {
        try {
          handler(payload as TPayload);
        } catch (error) {
          this.logger.warn(`Event handler for "${event}" threw`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return () => {
      this.eventHandlers.get(event)?.delete(handler as EventHandler);
    };
  }

  /**
   * Records a payload into the bounded per-event replay buffer, dropping the
   * oldest entry once `EVENT_REPLAY_BUFFER_SIZE` is exceeded.
   */
  private bufferEvent(event: string, payload: unknown): void {
    const buffer = this.eventReplayBuffer.get(event) ?? [];
    buffer.push(payload);
    if (buffer.length > EVENT_REPLAY_BUFFER_SIZE) buffer.shift();
    this.eventReplayBuffer.set(event, buffer);
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

  /**
   * A read-only view of every request currently awaiting a host reply, for
   * `MiniAppSdk.debug.snapshot()`.
   */
  getPendingRequests(): PendingRequestInfo[] {
    const now = Date.now();
    const result: PendingRequestInfo[] = [];
    for (const [requestId, request] of this.pending) {
      result.push({
        requestId,
        namespace: request.namespace,
        action: request.action,
        elapsedMs: now - request.startedAt,
      });
    }
    return result;
  }

  /** The SDK build version reported to the host during the handshake. */
  getSdkVersion(): string {
    return RPC_CLIENT_SDK_VERSION;
  }

  /** Debug-time view of the transport, for `MiniAppSdk.debug.snapshot()`. */
  getTransportDebugInfo(): TransportDebugInfo {
    return this.transport.getDebugInfo?.() ?? { started: this.started };
  }

  /**
   * Dispatches a local (SDK-originated) event to subscribers without going
   * through the transport or the host — used for connection-state
   * notifications that the host itself cannot deliver because the link is
   * down. Subscribers register exactly as they would for a host event:
   * `sdk.on("connection.lost", …)`. Matching the host-event routing, the
   * subscription fires as `event.subscribe` only when at least one handler
   * exists, so first registering a listener marks the connection "live".
   */
  private emitLocalEvent(event: string, payload: unknown): void {
    this.bufferEvent(event, payload);
    const handlers = this.eventHandlers.get(event);
    handlers?.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        this.logger.warn(`Event handler for "${event}" threw`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private startHeartbeat(): void {
    if (!this.heartbeatOptions || this.heartbeatInterval) return;

    const intervalMs =
      this.heartbeatOptions.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatInterval = setInterval(() => {
      void this.maybeSendHeartbeat();
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.heartbeatMissedPongs = 0;
    for (const [requestId, ping] of this.heartbeatPings) {
      clearTimeout(ping.timer);
      ping.onPong();
      this.heartbeatPings.delete(requestId);
    }
  }

  private maybeSendHeartbeat(): void {
    if (!this.started) return;
    if (this.reconnectInProgress) return;

    const timeoutMs =
      this.heartbeatOptions?.timeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    const maxMissedPongs =
      this.heartbeatOptions?.maxMissedPongs ?? DEFAULT_MAX_MISSED_PONGS;

    const heartbeatId = `${NAMESPACES.HEARTBEAT}.${ACTIONS.HEARTBEAT.PING}`;

    this.request<unknown>(
      NAMESPACES.HEARTBEAT,
      ACTIONS.HEARTBEAT.PING,
      undefined,
    )
      .then(() => {
        const ping = this.heartbeatPings.get(heartbeatId);
        if (ping) {
          clearTimeout(ping.timer);
          ping.onPong();
          this.heartbeatPings.delete(heartbeatId);
        }
      })
      .catch(() => {
        // The per-ping timer below already counted the miss; a request-level
        // failure (timeout after retries, transport error) only means the
        // host did not answer, which is what the counter records.
      });

    this.heartbeatPings.set(heartbeatId, {
      onPong: () => {
        this.heartbeatMissedPongs = 0;
      },
      timer: setTimeout(() => {
        this.heartbeatPings.delete(heartbeatId);
        this.heartbeatMissedPongs += 1;
        if (this.heartbeatMissedPongs >= maxMissedPongs) {
          this.handleLostConnection();
        }
      }, timeoutMs),
    });
  }

  private handleLostConnection(): void {
    if (!this.started || this.reconnectInProgress) return;
    this.reconnectInProgress = true;

    this.stopHeartbeat();
    this.emitLocalEvent(CONNECTION_EVENTS.LOST, {
      timestamp: Date.now(),
    });

    void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    let attempt = 0;
    while (this.started) {
      try {
        await this.handshake();
        this.reconnectInProgress = false;
        this.heartbeatMissedPongs = 0;
        this.emitLocalEvent(CONNECTION_EVENTS.ESTABLISHED, {
          timestamp: Date.now(),
        });
        return;
      } catch {
        const maxAttempts = Math.max(1, this.retryAttempts);
        if (attempt >= maxAttempts) {
          this.logger.warn(
            "Reconnect failed; giving up after repeated handshake failures",
            { attempts: attempt + 1 },
          );
          this.reconnectInProgress = false;
          return;
        }
        attempt += 1;
        await delay(
          computeBackoffMs(attempt, this.retryDelayMs, this.maxRetryDelayMs),
        );
      }
    }
  }

  private completeHandshake(
    ackPayload: unknown,
    resolvePromise: () => void,
    rejectPromise: (error: Error) => void,
  ): void {
    const ack = (
      ackPayload && typeof ackPayload === "object" ? ackPayload : {}
    ) as HandshakeAckPayload;

    if (ack.status === "rejected") {
      rejectPromise(
        new HandshakeError({
          message: ack.reason ?? "Host rejected the handshake request",
        }),
      );
      return;
    }

    if (
      ack.protocolVersion &&
      !majorVersionsMatch(ack.protocolVersion, PROTOCOL_VERSION)
    ) {
      rejectPromise(
        new HandshakeError({
          message: `Host protocol version "${ack.protocolVersion}" is incompatible with this SDK's protocol version "${PROTOCOL_VERSION}" (major version mismatch)`,
        }),
      );
      return;
    }

    if (ack.capabilities) {
      this.negotiatedCapabilities = SDK_CAPABILITIES.filter((capability) =>
        ack.capabilities?.includes(capability),
      );
      this.logger.debug("Negotiated capabilities with host", {
        capabilities: this.negotiatedCapabilities,
      });
    } else {
      this.negotiatedCapabilities = [...SDK_CAPABILITIES];
      this.logger.debug(
        "Host did not report capabilities during handshake; assuming full support",
        {
          assumed: this.negotiatedCapabilities,
        },
      );
    }

    resolvePromise();
    this.startHeartbeat();
  }

  private sendRequest<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const message = createMessage(
      "request",
      namespace,
      action,
      this.miniAppId,
      HOST_TARGET,
      payload,
      {
        traceId: this.traceId,
      },
    );

    return new Promise<T>((resolve, reject) => {
      const cleanupSignal = (): void => {
        signal?.removeEventListener("abort", handleAbort);
      };

      const handleAbort = (): void => {
        if (this.pending.has(message.requestId)) {
          this.pending.delete(message.requestId);
        }
        clearTimeout(timer);
        cleanupSignal();
        reject(
          new RequestCancelledError({
            namespace,
            action,
            cause: signal?.reason,
          }),
        );
      };

      const timer = setTimeout(() => {
        cleanupSignal();
        this.pending.delete(message.requestId);
        reject(
          new TimeoutError({ namespace, action, timeoutMs: this.timeout }),
        );
      }, this.timeout);

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          reject(
            new RequestCancelledError({
              namespace,
              action,
              cause: signal.reason,
            }),
          );
          return;
        }
        signal.addEventListener("abort", handleAbort, { once: true });
      }

      this.pending.set(message.requestId, {
        resolve: (value: unknown) => {
          cleanupSignal();
          resolve(value as T);
        },
        reject: (error: Error) => {
          cleanupSignal();
          reject(error);
        },
        timer,
        namespace,
        action,
        startedAt: Date.now(),
      });

      this.sendOrFail(message, () => {
        clearTimeout(timer);
        cleanupSignal();
        this.pending.delete(message.requestId);
      });
    });
  }

  private sendOrFail(message: PlatformMessage, onFailure: () => void): void {
    try {
      this.transport.send(message);
    } catch (error) {
      const pending = this.pending.get(message.requestId);
      onFailure();
      const err = error instanceof Error ? error : new Error(String(error));
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
    }
  }

  private handleIncomingMessage(message: PlatformMessage): void {
    if (message.target !== this.miniAppId && message.target !== "*") return;

    if (!hasCompatibleMajorVersion(message)) {
      this.logger.warn(
        "Dropped message with an incompatible protocol major version",
        {
          received: message.gsaProtocolVersion,
          expected: PROTOCOL_VERSION,
          namespace: message.namespace,
          action: message.action,
        },
      );
      return;
    }

    if (message.type === "response" || message.type === "handshake") {
      const pending = this.pending.get(message.requestId);
      if (!pending) {
        // A streamed request is normally answered entirely with `stream`
        // messages, but a host that refuses it up front may answer with a
        // plain `response` carrying an error. Surface that to the stream.
        const stream = this.streamConsumers.get(message.requestId)?.builder;
        if (stream && message.error) {
          stream.rejectChunk(
            new ProtocolError({
              reason: "host-rejected",
              platformError: message.error,
            }),
          );
        }
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);

      if (message.error) {
        pending.reject(
          new ProtocolError({
            reason: "host-rejected",
            platformError: message.error,
          }),
        );
      } else {
        pending.resolve(message.payload);
      }
      return;
    }

    if (message.type === "stream") {
      const stream = this.streamConsumers.get(message.requestId)?.builder;
      if (!stream) return;

      if (message.error) {
        stream.rejectChunk(
          new ProtocolError({
            reason: "host-rejected",
            platformError: message.error,
          }),
        );
        return;
      }

      const data =
        typeof message.payload === "string" ||
        message.payload instanceof Uint8Array
          ? message.payload
          : "";
      stream.addChunk({
        data,
        index: message.streamIndex ?? 0,
        total: message.streamTotal,
        last: message.streamLast ?? false,
      });
      return;
    }

    if (message.type === "event") {
      const key = `${message.namespace}.${message.action}`;
      this.bufferEvent(key, message.payload);
      const handlers = this.eventHandlers.get(key);
      handlers?.forEach((handler) => {
        handler(message.payload);
      });
    }
  }
}
