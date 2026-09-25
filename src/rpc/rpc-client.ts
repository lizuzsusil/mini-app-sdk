import {
  ACTIONS,
  CONNECTION_EVENTS,
  HOST_TARGET,
  NAMESPACES,
  PROTOCOL_VERSION,
  SDK_CAPABILITIES,
} from "../constants";
import { RPC_CLIENT_SDK_VERSION } from "../constants/version.generated";
import {
  HandshakeError,
  ProtocolError,
  RequestCancelledError,
  SdkError,
  TimeoutError,
} from "../errors";
import type { Logger } from "../logging";
import { noopLogger } from "../logging";
import type {
  RpcMetricsOptions,
  RpcMetricsSnapshot,
  Span,
  Tracer,
} from "../observability";
import { MetricsRecorder, noopTracer } from "../observability";
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
import { AdaptiveTimeout } from "../reliability/adaptive-timeout";
import { CircuitBreaker } from "../reliability/circuit-breaker";
import { StreamBuilder } from "../stream";
import type { Transport, TransportDebugInfo } from "../transport";
import type {
  HeartbeatOptions,
  OnEventOptions,
  PendingRequestInfo,
} from "../types";
import type { CircuitBreakerOptions } from "../types/sdk.types";
import { computeBackoffMs, delay, generateId } from "../utils";
import type { RpcMiddleware } from "./middleware";
import { composeMiddleware } from "./middleware";

export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

export interface RpcRequestOptions {
  signal?: AbortSignal;
  mapPayload?: (payload: unknown) => unknown;
  dedupe?: boolean;
}

export interface RpcStreamOptions {
  signal?: AbortSignal;
}

export interface RpcClientOptions {
  miniAppId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  logger?: Logger;
  devMode?: boolean;
  heartbeat?: HeartbeatOptions;
  metrics?: RpcMetricsOptions;
  circuitBreaker?: CircuitBreakerOptions;
  adaptiveTimeout?: {
    enabled?: boolean;
    factor?: number;
    minMs?: number;
    maxMs?: number;
  };

  tracer?: Tracer;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  namespace: string;
  action: string;
  startedAt: number;
}

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

const EVENT_REPLAY_BUFFER_SIZE = 5;

const DEDUPE_WINDOW_MS = 50;

const DEDUPE_ALLOW = new Set([
  "auth.getUser",
  "auth.isAuthenticated",
  "permissions.has",
  "permissions.list",
  "flags.isEnabled",
  "flags.getAll",
  "config.get",
  "config.getAll",
  "navigation.getCurrent",
  "storage.get",
  "platform.getType",
  "appearance.getLocale",
  "appearance.getTheme",
]);

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
  private readonly tracer: Tracer;
  private readonly warnedUnavailableCapabilities = new Set<string>();
  private readonly traceId: string;
  private started = false;
  private readonly dedupeMap = new Map<
    string,
    { promise: Promise<unknown>; expiresAt: number }
  >();
  private readonly eventInterceptors: Array<
    (event: string, payload: unknown) => unknown | false
  > = [];
  private readonly circuitBreaker: CircuitBreaker | null;
  private readonly adaptiveTimeout: AdaptiveTimeout | null;

  private reconnectInProgress = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatMissedPongs = 0;
  private readonly heartbeatPings = new Map<
    string,
    { onPong: () => void; timer: ReturnType<typeof setTimeout> }
  >();

  private readonly eventReplayBuffer = new Map<string, unknown[]>();

  private negotiatedCapabilities: string[] | null = null;
  private negotiatedCapabilityVersions: Record<string, string> | null = null;

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
    this.tracer = options.tracer ?? noopTracer;
    this.traceId = generateId();
    this.circuitBreaker = options.circuitBreaker
      ? new CircuitBreaker(options.circuitBreaker)
      : null;
    this.adaptiveTimeout = options.adaptiveTimeout?.enabled
      ? new AdaptiveTimeout({
          factor: options.adaptiveTimeout.factor,
          minMs: options.adaptiveTimeout.minMs,
          maxMs: options.adaptiveTimeout.maxMs,
        })
      : null;
  }

  //initial start method for handle communication

  start(): void {
    if (this.started) return;
    this.transport.start((message: unknown) =>
      this.handleIncomingMessage(message),
    );
    this.started = true;
  }

  // stop method for handle communication disconnect
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

  async handshake(): Promise<void> {
    const span = this.tracer.startSpan("rpc.handshake", {
      miniAppId: this.miniAppId,
      traceId: this.traceId,
    });
    try {
      await this.performHandshake();
    } finally {
      span.end();
    }
  }

  private async performHandshake(): Promise<void> {
    const payload: HandshakePayload = {
      miniAppId: this.miniAppId,
      sdkVersion: RPC_CLIENT_SDK_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      protocolVersionRange: `^${PROTOCOL_VERSION}`,
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

  use(middleware: RpcMiddleware): void {
    this.middlewares.push(middleware);
  }

  addEventInterceptor(
    interceptor: (event: string, payload: unknown) => unknown | false,
  ): () => void {
    this.eventInterceptors.push(interceptor);
    return () => {
      const idx = this.eventInterceptors.indexOf(interceptor);
      if (idx !== -1) this.eventInterceptors.splice(idx, 1);
    };
  }

  async request<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
  ): Promise<T> {
    this.assertCapability(namespace, action);
    this.warnOnUnavailableCapability(namespace, action);
    if (
      this.circuitBreaker &&
      !this.circuitBreaker.shouldAllow(namespace, action)
    ) {
      throw new ProtocolError({
        reason: "host-rejected",
        message: `Circuit open for "${namespace}.${action}" — host is degraded, failing fast`,
        platformError: { code: "CIRCUIT_OPEN", message: "Circuit open" },
      });
    }
    const dedupeKey = `${namespace}.${action}:${JSON.stringify(payload ?? null)}`;
    const shouldDedupe =
      options?.dedupe !== false &&
      !options?.signal &&
      !options?.mapPayload &&
      DEDUPE_ALLOW.has(`${namespace}.${action}`);
    if (shouldDedupe) {
      const existing = this.dedupeMap.get(dedupeKey);
      if (existing && Date.now() < existing.expiresAt) {
        return existing.promise as Promise<T>;
      }
    }
    const span = this.tracer.startSpan("rpc.request", {
      namespace,
      action,
      traceId: this.traceId,
    });
    const promise = (async (): Promise<T> => {
      try {
        return await composeMiddleware<T>(
          this.middlewares,
          { namespace, action, payload, attempt: 0 },
          () =>
            this.executeWithRetry<T>(namespace, action, payload, options, span),
        );
      } catch (error) {
        span.setAttribute(
          "error",
          error instanceof Error ? error.message : String(error),
        );
        span.setAttribute(
          "retryable",
          error instanceof Error && "retryable" in error
            ? Boolean((error as { retryable?: boolean }).retryable)
            : false,
        );
        throw error;
      } finally {
        span.end();
      }
    })();
    const tracked: Promise<T> = promise.then(
      (value) => {
        this.circuitBreaker?.recordSuccess(namespace, action);
        if (this.adaptiveTimeout)
          this.adaptiveTimeout.observe(this.metricsRecorder.snapshot());
        return value;
      },
      (error: unknown) => {
        const isCancelled = error instanceof RequestCancelledError;
        if (!isCancelled) this.circuitBreaker?.recordFailure(namespace, action);
        throw error;
      },
    );
    if (shouldDedupe) {
      this.dedupeMap.set(dedupeKey, {
        promise: tracked,
        expiresAt: Date.now() + DEDUPE_WINDOW_MS,
      });
      tracked
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            const e = this.dedupeMap.get(dedupeKey);
            if (e?.promise === tracked) this.dedupeMap.delete(dedupeKey);
          }, DEDUPE_WINDOW_MS + 10);
        });
      return tracked;
    }
    return tracked;
  }

  async batch(
    requests: Array<{
      namespace: string;
      action: string;
      payload?: unknown;
      options?: RpcRequestOptions;
    }>,
  ): Promise<
    Array<{ ok: true; value: unknown } | { ok: false; error: Error }>
  > {
    if (this.negotiatedCapabilities?.includes("batch")) {
      try {
        const result = await this.request<{
          results: Array<{ ok: boolean; value?: unknown; error?: unknown }>;
        }>("batch", "execute", {
          requests: requests.map((r) => ({
            namespace: r.namespace,
            action: r.action,
            payload: r.payload,
          })),
        });
        return (result.results ?? []).map((r) =>
          r.ok
            ? { ok: true as const, value: r.value as unknown }
            : {
                ok: false as const,
                error:
                  r.error instanceof Error
                    ? r.error
                    : new Error(String(r.error)),
              },
        );
      } catch {
        // fall back to parallel on batch failure
      }
    }
    return Promise.all(
      requests.map(async (r) => {
        try {
          const v = await this.request(
            r.namespace,
            r.action,
            r.payload,
            r.options,
          );
          return { ok: true as const, value: v };
        } catch (error) {
          return {
            ok: false as const,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }),
    );
  }

  // get all the required capability
  private getRequiredCapability(namespace: string): string {
    return namespace;
  }

  private assertCapability(namespace: string, action: string): void {
    if (!this.negotiatedCapabilities) return;
    const required = this.getRequiredCapability(namespace);
    if (!(SDK_CAPABILITIES as readonly string[]).includes(required)) return;
    if (
      (
        [
          NAMESPACES.PLATFORM,
          NAMESPACES.HANDSHAKE,
          NAMESPACES.EVENT,
          NAMESPACES.APPEARANCE,
          NAMESPACES.NAVIGATION,
          NAMESPACES.AUTH,
        ] as readonly string[]
      ).includes(required)
    )
      return;
    if (this.negotiatedCapabilities.includes(required)) return;
    throw new SdkError({
      code: "CAPABILITY_NOT_SUPPORTED",
      message: `"${namespace}.${action}" requires the "${required}" capability, but the host did not negotiate it`,
    });
  }

  private warnOnUnavailableCapability(namespace: string, action: string): void {
    if (!this.devMode) return;
    if (!this.negotiatedCapabilities) return;
    const required = this.getRequiredCapability(namespace);
    if (!(SDK_CAPABILITIES as readonly string[]).includes(required)) return;
    if (
      (
        [
          NAMESPACES.PLATFORM,
          NAMESPACES.HANDSHAKE,
          NAMESPACES.EVENT,
          NAMESPACES.APPEARANCE,
          NAMESPACES.NAVIGATION,
          NAMESPACES.AUTH,
        ] as readonly string[]
      ).includes(required)
    )
      return;
    if (this.negotiatedCapabilities.includes(required)) return;

    const key = `${namespace}.${action}`;
    if (this.warnedUnavailableCapabilities.has(key)) return;
    this.warnedUnavailableCapabilities.add(key);
    this.logger.warn(
      `[dev] "${key}" requires the "${required}" capability, but the host did not negotiate it — the request will likely fail`,
    );
  }

  private async executeWithRetry<T>(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcRequestOptions,
    span?: Span,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      if (options?.signal?.aborted) {
        throw new RequestCancelledError({
          namespace,
          action,
          cause: options.signal.reason,
        });
      }

      const startedAt = Date.now();
      try {
        const result = await this.sendRequest<T>(
          namespace,
          action,
          payload,
          options?.signal,
        );
        const mapped = options?.mapPayload
          ? (options.mapPayload(result) as T)
          : result;
        this.metricsRecorder.recordSuccess(
          namespace,
          action,
          Date.now() - startedAt,
        );
        return mapped;
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
          span?.setAttribute("retryCount", attempt + 1);
          await this.abortAwareDelay(
            computeBackoffMs(attempt, this.retryDelayMs, this.maxRetryDelayMs),
            namespace,
            action,
            options?.signal,
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

  // stream based response request method
  async sendStreamRequest(
    namespace: string,
    action: string,
    payload?: unknown,
    options?: RpcStreamOptions,
  ): Promise<StreamBuilder> {
    this.assertCapability(namespace, action);
    this.warnOnUnavailableCapability(namespace, action);
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

    const span = this.tracer.startSpan("rpc.stream", {
      namespace,
      action,
      traceId: this.traceId,
    });

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

    builder.waitUntilDone().then(
      () => {
        cleanup();
        span.setAttribute("bytes", builder.receivedBytes);
        span.end();
      },
      (error: unknown) => {
        cleanup();
        span.setAttribute(
          "error",
          error instanceof Error ? error.message : String(error),
        );
        span.end();
      },
    );

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    return builder;
  }

  cancelStream(requestId: string): void {
    const record = this.streamConsumers.get(requestId);
    if (!record) return;
    this.cancelStreamBuilder(requestId);
  }

  private cancelStreamBuilder(requestId: string, error?: Error): void {
    this.streamConsumers.get(requestId)?.builder.cancel(error);
  }

  private notifyHostStreamCancelled(requestId: string): void {
    const record = this.streamConsumers.get(requestId);
    if (!record) return;
    this.request<unknown>(record.namespace, ACTIONS.API.CANCEL, {
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

  onEvent<TPayload = unknown>(
    event: string,
    handler: EventHandler<TPayload>,
    options?: OnEventOptions,
  ): () => void {
    if (options?.signal?.aborted) {
      return () => {};
    }
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

    const handlers = this.eventHandlers.get(event);
    handlers?.add(handler as EventHandler);

    if (this.devMode && handlers && handlers.size > 20) {
      this.logger.warn(
        `[dev] "${event}" now has ${handlers.size} handlers — possible leak (subscribe without unsubscribe)`,
      );
    }

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

    const unsubscribe = (): void => {
      this.eventHandlers.get(event)?.delete(handler as EventHandler);
      options?.signal?.removeEventListener("abort", unsubscribe);
    };

    if (options?.signal) {
      options.signal.addEventListener("abort", unsubscribe, { once: true });
    }

    return unsubscribe;
  }

  private bufferEvent(event: string, payload: unknown): void {
    const buffer = this.eventReplayBuffer.get(event) ?? [];
    buffer.push(payload);
    if (buffer.length > EVENT_REPLAY_BUFFER_SIZE) buffer.shift();
    this.eventReplayBuffer.set(event, buffer);
  }

  getTraceId(): string {
    return this.traceId;
  }

  getCapabilities(): readonly string[] {
    return this.negotiatedCapabilities ?? [];
  }

  getCapabilityVersions(): Readonly<Record<string, string>> {
    return this.negotiatedCapabilityVersions ?? {};
  }

  getCircuitState(namespace: string, action: string): string {
    return this.circuitBreaker?.getState(namespace, action) ?? "closed";
  }

  getAdaptiveTimeoutProposal(): number | null {
    return this.adaptiveTimeout?.propose() ?? null;
  }

  getMetrics(): RpcMetricsSnapshot {
    return this.metricsRecorder.snapshot();
  }

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

  //this gives const value for now.
  getSdkVersion(): string {
    return RPC_CLIENT_SDK_VERSION;
  }

  getTransportDebugInfo(): TransportDebugInfo {
    return this.transport.getDebugInfo?.() ?? { started: this.started };
  }

  private emitLocalEvent(event: string, payload: unknown): void {
    const intercepted = this.runEventInterceptors(event, payload);
    if (intercepted === false) return;
    const finalPayload = intercepted;
    this.bufferEvent(event, finalPayload);
    const handlers = this.eventHandlers.get(event);
    handlers?.forEach((handler) => {
      try {
        handler(finalPayload);
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
      .catch(() => {});

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
      if (Array.isArray(ack.capabilities)) {
        this.negotiatedCapabilities = SDK_CAPABILITIES.filter((capability) =>
          (ack.capabilities as string[])?.includes(capability),
        );
        this.logger.debug("Negotiated capabilities with host", {
          capabilities: this.negotiatedCapabilities,
        });
      } else if (typeof ack.capabilities === "object") {
        const capMap = ack.capabilities as Record<string, string>;
        this.negotiatedCapabilityVersions = { ...capMap };
        this.negotiatedCapabilities = Object.keys(capMap).filter((cap) =>
          SDK_CAPABILITIES.includes(cap),
        );
        this.logger.debug("Negotiated capabilities (version map) with host", {
          capabilities: this.negotiatedCapabilities,
          versions: this.negotiatedCapabilityVersions,
        });
      }
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

  // method work when the mini app send request message to the host.
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
      let payload: unknown = message.payload;
      for (const interceptor of this.eventInterceptors) {
        try {
          const result = interceptor(key, payload);
          if (result === false) return;
          if (result !== undefined) payload = result;
        } catch (error) {
          this.logger.warn(`Event interceptor for "${key}" threw`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.bufferEvent(key, payload);
      const handlers = this.eventHandlers.get(key);
      handlers?.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          this.logger.warn(`Event handler for "${key}" threw`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  private runEventInterceptors(
    event: string,
    payload: unknown,
  ): unknown | false {
    let current: unknown = payload;
    for (const interceptor of this.eventInterceptors) {
      try {
        const result = interceptor(event, current);
        if (result === false) return false;
        if (result !== undefined) current = result;
      } catch (error) {
        this.logger.warn(`Event interceptor for "${event}" threw`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return current;
  }
}
