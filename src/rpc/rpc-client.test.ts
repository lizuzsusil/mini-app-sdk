import { describe, expect, it, vi } from "vitest";
import {
  ACTIONS,
  CONNECTION_EVENTS,
  HOST_TARGET,
  NAMESPACES,
} from "../constants";
import {
  HandshakeError,
  ProtocolError,
  RequestCancelledError,
  TimeoutError,
} from "../errors";
import type { Logger } from "../logging";
import type { PlatformMessage } from "../protocol";
import { createMessage } from "../protocol";
import { FakeTransport } from "../testing";
import { RpcClient } from "./rpc-client";

function makeClient(
  transport: FakeTransport,
  overrides: Partial<{
    timeout: number;
    retryAttempts: number;
    retryDelayMs: number;
  }> = {},
) {
  return new RpcClient(transport, {
    miniAppId: "test-mini-app",
    timeout: overrides.timeout ?? 1000,
    retryAttempts: overrides.retryAttempts ?? 2,
    retryDelayMs: overrides.retryDelayMs ?? 1,
  });
}

describe("RpcClient", () => {
  it("starts and stops the underlying transport", () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);

    client.start();
    expect(transport.started).toBe(true);

    client.stop();
    expect(transport.stopCalls).toBe(1);
  });

  it("sends a well-formed request envelope addressed to the host", () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    void client.request("auth", "getUser");

    expect(transport.sent).toHaveLength(1);
    const sent = transport.lastSent!;
    expect(sent.namespace).toBe("auth");
    expect(sent.action).toBe("getUser");
    expect(sent.type).toBe("request");
    expect(sent.source).toBe("test-mini-app");
    expect(sent.target).toBe(HOST_TARGET);
    expect(sent.requestId).toBeTruthy();
  });

  it("resolves a request when a matching response arrives", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.request<{ id: string }>(
      NAMESPACES.AUTH,
      ACTIONS.AUTH.GET_USER,
    );
    const sent = transport.lastSent!;

    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { id: "user-1" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );

    await expect(promise).resolves.toEqual({ id: "user-1" });
  });

  it("ignores responses addressed to a different mini app", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 20 });
    client.start();

    const promise = client.request(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER);
    const sent = transport.lastSent!;

    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "someone-elses-mini-app",
        { id: "nope" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );

    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it("rejects with a ProtocolError carrying the host error when the response contains one", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.request(
      NAMESPACES.PERMISSIONS,
      ACTIONS.PERMISSIONS.HAS,
    );
    const sent = transport.lastSent!;

    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        undefined,
        {
          requestId: sent.requestId,
          traceId: sent.traceId,
          error: {
            code: "PERMISSION_DENIED",
            message: "nope",
            retryable: false,
          },
        },
      ),
    );

    await expect(promise).rejects.toBeInstanceOf(ProtocolError);
    await expect(promise).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      retryable: false,
    });
  });

  it("rejects with TimeoutError when no response arrives in time", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 10, retryAttempts: 0 });
    client.start();

    await expect(
      client.request(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("retries a retryable failure up to retryAttempts times", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, {
      timeout: 10,
      retryAttempts: 2,
      retryDelayMs: 1,
    });
    client.start();

    const promise = client.request(NAMESPACES.DEVICE, ACTIONS.DEVICE.NETWORK);

    // let all three attempts (1 initial + 2 retries) time out
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    expect(transport.sent).toHaveLength(3);
  });

  it("resolves the handshake when the host responds", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.handshake();
    const sent = transport.lastSent!;
    expect(sent.type).toBe("handshake");

    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "ok" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );

    await expect(promise).resolves.toBeUndefined();
  });

  it("sends its protocol version and capability list in the handshake payload", () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    void client.handshake();

    const sent = transport.lastSent!;
    const payload = sent.payload as {
      protocolVersion: string;
      capabilities: string[];
    };
    expect(payload.protocolVersion).toBe("1.0.0");
    expect(payload.capabilities).toContain("auth");
    expect(payload.capabilities).toContain("http");
  });

  it("narrows capabilities to what the host confirms it supports", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        {
          status: "ok",
          protocolVersion: "1.0.0",
          capabilities: ["auth", "http"],
        },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
    await promise;

    expect(client.getCapabilities()).toEqual(["auth", "http"]);
  });

  it("assumes full capability support when the host does not report any", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "ok" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
    await promise;

    expect(client.getCapabilities()).toContain("auth");
    expect(client.getCapabilities()).toContain("device");
  });

  it("rejects the handshake when the host reports an incompatible major protocol version", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "ok", protocolVersion: "4.0.0" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );

    await expect(promise).rejects.toBeInstanceOf(HandshakeError);
  });

  it("accepts a host on a compatible minor/patch protocol version", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "ok", protocolVersion: "1.9.2" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );

    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects the handshake when the host explicitly refuses the connection", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "rejected", reason: "module not registered" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );

    await expect(promise).rejects.toThrow("module not registered");
  });

  it("drops incoming messages with an incompatible protocol major version", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 20 });
    client.start();

    const promise = client.request(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER);
    const sent = transport.lastSent!;

    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { id: "x" },
        {
          requestId: sent.requestId,
          traceId: sent.traceId,
          gsaProtocolVersion: "99.0.0",
        },
      ),
    );

    // the incompatible-version response is dropped, so the request still times out
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it("rejects the handshake with HandshakeError on timeout", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 10 });
    client.start();

    await expect(client.handshake()).rejects.toBeInstanceOf(HandshakeError);
  });

  it("dispatches events to subscribed handlers only", () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const handler = vi.fn();
    const unsubscribe = client.onEvent("notification.received", handler);

    transport.simulateIncoming(
      createMessage(
        "event",
        "notification",
        "received",
        HOST_TARGET,
        "test-mini-app",
        { title: "Hi" },
      ),
    );
    expect(handler).toHaveBeenCalledWith({ title: "Hi" });

    unsubscribe();
    transport.simulateIncoming(
      createMessage(
        "event",
        "notification",
        "received",
        HOST_TARGET,
        "test-mini-app",
        { title: "Again" },
      ),
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rejects all pending requests when stopped", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 5000 });
    client.start();

    const promise = client.request(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET_ALL);
    client.stop();

    await expect(promise).rejects.toBeInstanceOf(ProtocolError);
  });
});

describe("RpcClient debug introspection", () => {
  it("reports in-flight requests via getPendingRequests", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 5000 });
    client.start();

    const promise = client.request(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER);
    const sent = transport.lastSent!;

    const pending = client.getPendingRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      requestId: sent.requestId,
      namespace: "auth",
      action: "getUser",
    });
    expect(pending[0].elapsedMs).toBeGreaterThanOrEqual(0);

    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { id: "u1" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
    await promise;
    expect(client.getPendingRequests()).toHaveLength(0);
  });

  it("exposes the SDK version and transport debug info", () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    expect(client.getSdkVersion()).toBe("3.0.0");
    expect(client.getTransportDebugInfo().started).toBe(false);

    client.start();
    expect(client.getTransportDebugInfo().started).toBe(true);
  });
});

describe("RpcClient dev-mode capability warnings", () => {
  function loggerSpy() {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
  }

  async function handshakeWithCapabilities(
    transport: FakeTransport,
    client: RpcClient,
    capabilities: string[],
  ): Promise<void> {
    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "ok", capabilities },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
    await promise;
  }

  function resolveRequest(
    transport: FakeTransport,
    sent: PlatformMessage,
    promise: Promise<unknown>,
  ): Promise<unknown> {
    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        undefined,
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
    return promise;
  }

  it("warns once when a request targets a namespace the host did not negotiate", async () => {
    const transport = new FakeTransport();
    const logger = loggerSpy();
    const client = new RpcClient(transport, {
      miniAppId: "test-mini-app",
      timeout: 5000,
      devMode: true,
      logger,
    });
    client.start();
    await handshakeWithCapabilities(transport, client, ["auth"]);

    const p1 = client.request(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION);
    const sent1 = transport.lastSent!;
    const p2 = client.request(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION);
    const sent2 = transport.lastSent!;

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("device.location"),
    );

    await resolveRequest(transport, sent1, p1);
    await resolveRequest(transport, sent2, p2);
  });

  it("does not warn for negotiated or protocol-level namespaces", async () => {
    const transport = new FakeTransport();
    const logger = loggerSpy();
    const client = new RpcClient(transport, {
      miniAppId: "test-mini-app",
      timeout: 5000,
      devMode: true,
      logger,
    });
    client.start();
    await handshakeWithCapabilities(transport, client, ["auth"]);

    const p1 = client.request(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER);
    const sent1 = transport.lastSent!;
    const p2 = client.request(NAMESPACES.EVENT, ACTIONS.EVENT.SUBSCRIBE);
    const sent2 = transport.lastSent!;

    expect(logger.warn).not.toHaveBeenCalled();

    await resolveRequest(transport, sent1, p1);
    await resolveRequest(transport, sent2, p2);
  });

  it("does not warn when devMode is off", async () => {
    const transport = new FakeTransport();
    const logger = loggerSpy();
    const client = new RpcClient(transport, {
      miniAppId: "test-mini-app",
      timeout: 5000,
      devMode: false,
      logger,
    });
    client.start();
    await handshakeWithCapabilities(transport, client, ["auth"]);

    const p = client.request(NAMESPACES.DEVICE, ACTIONS.DEVICE.LOCATION);
    const sent = transport.lastSent!;
    expect(logger.warn).not.toHaveBeenCalled();

    await resolveRequest(transport, sent, p);
  });
});

describe("RpcClient stream requests", () => {
  function streamChunk(
    requestId: string,
    traceId: string,
    data: string,
    index: number,
    last = false,
  ) {
    const message = createMessage(
      "stream",
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
      HOST_TARGET,
      "test-mini-app",
      data,
      {
        requestId,
        traceId,
      },
    );
    return Object.assign(message, {
      streamIndex: index,
      streamTotal: index + 1,
      streamLast: last,
    });
  }

  it("sends a well-formed stream request envelope addressed to the host", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    await client.sendStreamRequest(NAMESPACES.AI, ACTIONS.AI.CHAT, {
      messages: [{ role: "user", content: "Hi" }],
    });

    const sent = transport.lastSent!;
    expect(sent.type).toBe("request");
    expect(sent.namespace).toBe("ai");
    expect(sent.action).toBe("chat");
    expect(sent.target).toBe(HOST_TARGET);
    expect(sent.source).toBe("test-mini-app");
  });

  it("assembles incoming stream chunks into a completed StreamBuilder", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const builderPromise = client.sendStreamRequest(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
    );
    const sent = transport.lastSent!;

    transport.simulateIncoming(
      streamChunk(sent.requestId, sent.traceId, "Hello", 0),
    );
    transport.simulateIncoming(
      streamChunk(sent.requestId, sent.traceId, " world", 1),
    );
    transport.simulateIncoming(
      streamChunk(sent.requestId, sent.traceId, "!", 2, true),
    );

    const builder = await builderPromise;
    await expect(builder.waitUntilDone()).resolves.toBeUndefined();
    expect(builder.isDone).toBe(true);

    const parts: string[] = [];
    for await (const part of builder.iterate()) parts.push(String(part));
    expect(parts).toEqual(["Hello", " world", "!"]);
  });

  it("rejects the stream when the host refuses the request with a response error", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const builderPromise = client.sendStreamRequest(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
    );
    const sent = transport.lastSent!;

    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        undefined,
        {
          requestId: sent.requestId,
          traceId: sent.traceId,
          error: {
            code: "AI_UNAVAILABLE",
            message: "no model configured",
            retryable: false,
          },
        },
      ),
    );

    const builder = await builderPromise;
    await expect(builder.waitUntilDone()).rejects.toBeInstanceOf(ProtocolError);
    await expect(builder.waitUntilDone()).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
  });

  it("rejects the stream when a stream message carries an error", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    client.start();

    const builderPromise = client.sendStreamRequest(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
    );
    const sent = transport.lastSent!;

    const message = streamChunk(sent.requestId, sent.traceId, "partial", 0);
    Object.assign(message, {
      error: {
        code: "STREAM_FAILED",
        message: "stream aborted",
        retryable: true,
      },
    });
    transport.simulateIncoming(message);

    const builder = await builderPromise;
    await expect(builder.waitUntilDone()).rejects.toMatchObject({
      code: "STREAM_FAILED",
      retryable: true,
    });
  });

  it("times out when the host never answers", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 10, retryAttempts: 0 });
    client.start();

    const builder = await client.sendStreamRequest(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
    );
    await expect(builder.waitUntilDone()).rejects.toBeInstanceOf(TimeoutError);
  });

  it("rejects active streams when stopped", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 5000 });
    client.start();

    const builder = await client.sendStreamRequest(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
    );
    client.stop();

    await expect(builder.waitUntilDone()).rejects.toBeInstanceOf(ProtocolError);
    expect(builder.isRejected).toBe(true);
  });
});

describe("RpcClient AbortSignal cancellation", () => {
  it("rejects an in-flight request with RequestCancelledError when the signal fires", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 5000 });
    client.start();

    const controller = new AbortController();
    const promise = client.request(
      NAMESPACES.DEVICE,
      ACTIONS.DEVICE.LOCATION,
      undefined,
      { signal: controller.signal },
    );
    expect(transport.lastSent).toBeTruthy();

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(RequestCancelledError);
    expect(client.getPendingRequests()).toHaveLength(0);
  });

  it("rejects immediately without sending when the signal is already aborted", async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport, { timeout: 5000 });
    client.start();

    const controller = new AbortController();
    controller.abort();

    const promise = client.request(
      NAMESPACES.DEVICE,
      ACTIONS.DEVICE.LOCATION,
      undefined,
      { signal: controller.signal },
    );

    await expect(promise).rejects.toBeInstanceOf(RequestCancelledError);
    expect(transport.sent).toHaveLength(0);
  });

  it("aborts during the retry backoff instead of waiting it out", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport();
      const client = makeClient(transport, {
        timeout: 10,
        retryAttempts: 2,
        retryDelayMs: 1000,
      });
      client.start();

      const controller = new AbortController();
      const promise = client.request(
        NAMESPACES.DEVICE,
        ACTIONS.DEVICE.NETWORK,
        undefined,
        { signal: controller.signal },
      );

      // Let the first attempt time out (retryable) and settle into its backoff.
      await vi.advanceTimersByTimeAsync(10);
      controller.abort();

      await expect(promise).rejects.toBeInstanceOf(RequestCancelledError);
      expect(transport.sent).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("RpcClient heartbeat & reconnect", () => {
  async function completeHandshake(
    transport: FakeTransport,
    client: RpcClient,
  ): Promise<void> {
    const promise = client.handshake();
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "handshake",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        { status: "ok" },
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
    await promise;
  }

  function answerRequest(transport: FakeTransport): void {
    const sent = transport.lastSent!;
    transport.simulateIncoming(
      createMessage(
        "response",
        sent.namespace,
        sent.action,
        HOST_TARGET,
        "test-mini-app",
        undefined,
        { requestId: sent.requestId, traceId: sent.traceId },
      ),
    );
  }

  function makeHeartbeatClient(transport: FakeTransport): RpcClient {
    return new RpcClient(transport, {
      miniAppId: "test-mini-app",
      timeout: 5000,
      retryAttempts: 0,
      heartbeat: { intervalMs: 1000, timeoutMs: 2000, maxMissedPongs: 2 },
    });
  }

  it("sends heartbeat.ping on the configured interval after the handshake", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport();
      const client = makeHeartbeatClient(transport);
      client.start();
      await completeHandshake(transport, client);

      expect(transport.sent).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(transport.sent).toHaveLength(2);
      const ping = transport.lastSent!;
      expect(ping.namespace).toBe(NAMESPACES.HEARTBEAT);
      expect(ping.action).toBe(ACTIONS.HEARTBEAT.PING);

      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets the miss counter when the host answers a ping", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport();
      const client = makeHeartbeatClient(transport);
      const lost = vi.fn();
      client.onEvent(CONNECTION_EVENTS.LOST, lost);
      client.start();
      await completeHandshake(transport, client);

      await vi.advanceTimersByTimeAsync(1000);
      expect(transport.lastSent!.action).toBe(ACTIONS.HEARTBEAT.PING);
      answerRequest(transport);

      // Answer enough pings that a dead host would have tripped the counter.
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        answerRequest(transport);
      }

      expect(lost).not.toHaveBeenCalled();
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits connection.lost, re-handshakes, and emits connection.established", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport();
      const client = makeHeartbeatClient(transport);
      const lost = vi.fn();
      const established = vi.fn();
      client.onEvent(CONNECTION_EVENTS.LOST, lost);
      client.onEvent(CONNECTION_EVENTS.ESTABLISHED, established);
      client.start();
      await completeHandshake(transport, client);

      // Two unanswered pings (per-ping timeout of 2000ms each) trip the counter.
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);

      expect(lost).toHaveBeenCalledTimes(1);
      expect(lost).toHaveBeenCalledWith({ timestamp: expect.any(Number) });

      // The reconnect handshake has been sent; answer it to complete recovery.
      expect(transport.lastSent!.type).toBe("handshake");
      answerRequest(transport);

      await vi.advanceTimersByTimeAsync(0);
      expect(established).toHaveBeenCalledTimes(1);
      expect(established).toHaveBeenCalledWith({ timestamp: expect.any(Number) });

      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing when heartbeat is not configured", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport();
      const client = makeClient(transport);
      client.start();
      await completeHandshake(transport, client);

      await vi.advanceTimersByTimeAsync(5000);
      expect(transport.sent).toHaveLength(1);

      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
