import { describe, expect, it, vi } from "vitest";
import { ACTIONS, HTTP_EVENTS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import { StreamBuilder } from "../stream";
import { createApiModule } from "./api.module";

function makeModule() {
  const request = vi.fn(
    async (
      _namespace: string,
      _action: string,
      _payload?: unknown,
      _options?: unknown,
    ) => ({ status: 200, data: {}, headers: {} }),
  );
  const sendStreamRequest = vi.fn(
    async (
      _namespace: string,
      _action: string,
      _payload?: unknown,
      _options?: unknown,
    ) => new StreamBuilder(),
  );
  const onEvent = vi.fn(
    (_event: string, _handler: (payload: unknown) => void) => () => {},
  );
  const rpc = { request, sendStreamRequest, onEvent } as unknown as RpcClient;
  return { rpc, request, sendStreamRequest, onEvent, module: createApiModule(rpc) };
}

describe("api module", () => {
  it("defaults to POST for calls without a method", async () => {
    const { request, sendStreamRequest, module } = makeModule();

    await module.request("POST", {
      path: "/chat/session",
      body: { action: "session.start" },
    });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      body: {
        method: "POST",
        path: "/chat/session",
        body: { action: "session.start" },
      },
    });
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });

  it("defaults a missing method to POST", async () => {
    const { request, module } = makeModule();

    await module.request(undefined, {
      path: "/chat/session",
      body: { hello: "world" },
    });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      body: { method: "POST", path: "/chat/session", body: { hello: "world" } },
    });
  });

  it("folds query into the envelope path and forwards headers", async () => {
    const { request, module } = makeModule();

    await module.request("GET", {
      path: "/files/dl",
      query: { id: "1" },
      headers: { Accept: "application/octet-stream" },
    });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      body: { method: "GET", path: "/files/dl?id=1" },
      headers: { Accept: "application/octet-stream" },
    });
  });

  it("maps the legacy endpoint alias to the envelope path", async () => {
    const { request, module } = makeModule();

    await module.request("POST", {
      endpoint: "/chat/stream",
      body: { message: "hi" },
    });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      body: { method: "POST", path: "/chat/stream", body: { message: "hi" } },
    });
  });

  it("routes stream:true through sendStreamRequest on the same api.request action", async () => {
    const { request, sendStreamRequest, module } = makeModule();

    await module.request("POST", {
      path: "/chat/stream",
      body: { messages: [{ role: "user", content: "hello" }] },
      stream: true,
    });

    expect(request).not.toHaveBeenCalled();
    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        body: {
          method: "POST",
          path: "/chat/stream",
          body: { messages: [{ role: "user", content: "hello" }] },
        },
        stream: true,
      },
      undefined,
    );
  });

  it("streams via the endpoint alias + stream:true", async () => {
    const { sendStreamRequest, module } = makeModule();

    await module.request("GET", {
      endpoint: "/files/dl",
      stream: true,
    });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        body: { method: "GET", path: "/files/dl" },
        stream: true,
      },
      undefined,
    );
  });

  it("passes no body-specific validation — bodies stay opaque", async () => {
    const { sendStreamRequest, module } = makeModule();

    await expect(
      module.request("POST", {
        path: "/chat/stream",
        body: { whatever: 1 },
        stream: true,
      }),
    ).resolves.toBeDefined();
    expect(sendStreamRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects calls without a path or endpoint", async () => {
    const { request, sendStreamRequest, module } = makeModule();

    await expect(
      module.request("POST", { body: { hello: "world" } }),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    await expect(
      module.request("POST", { body: { hello: "world" }, stream: true }),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    expect(request).not.toHaveBeenCalled();
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });

  it("forwards the AbortSignal for streams", async () => {
    const { sendStreamRequest, module } = makeModule();
    const controller = new AbortController();

    await module.request("POST", {
      path: "/chat/stream",
      body: { messages: [] },
      stream: true,
      signal: controller.signal,
    });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      expect.objectContaining({ stream: true }),
      { signal: controller.signal },
    );
  });

  it("remaps legacy method:STREAM to stream:true", async () => {
    const { sendStreamRequest, module } = makeModule();

    await module.request("STREAM", {
      path: "/chat/stream",
      body: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        body: {
          method: "POST",
          path: "/chat/stream",
          body: { messages: [{ role: "user", content: "hello" }] },
        },
        stream: true,
      },
      undefined,
    );
  });

  it("remaps legacy stream:{ signal } to a stream", async () => {
    const { sendStreamRequest, module } = makeModule();
    const controller = new AbortController();

    await (module.request as unknown as (method: string, params: unknown) => Promise<unknown>)(
      "POST",
      {
        path: "/chat/stream",
        body: { messages: [{ role: "user", content: "hello" }] },
        stream: { signal: controller.signal },
      },
    );

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      expect.objectContaining({ stream: true }),
      { signal: controller.signal },
    );
  });

  it("rejects the removed object form with INVALID_PARAMS", async () => {
    const { request, sendStreamRequest, module } = makeModule();

    await expect(
      (module.request as unknown as (params: unknown) => Promise<unknown>)({
        method: "POST",
        body: { hello: "world" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    expect(request).not.toHaveBeenCalled();
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });

  it("subscribes to upload progress and unsubscribes once the request settles", async () => {
    const { onEvent, module } = makeModule();
    const unsubscribe = vi.fn();
    onEvent.mockReturnValue(unsubscribe);
    const onProgress = vi.fn();

    await module.request("POST", {
      endpoint: "https://files.example/up",
      body: "payload",
      onProgress,
    });

    expect(onEvent).toHaveBeenCalledWith(
      HTTP_EVENTS.UPLOAD_PROGRESS,
      expect.any(Function),
    );
    const handler = onEvent.mock.calls[0]![1] as (p: unknown) => void;
    handler({ uploadedBytes: 10, totalBytes: 100 });
    expect(onProgress).toHaveBeenCalledWith({
      uploadedBytes: 10,
      totalBytes: 100,
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
