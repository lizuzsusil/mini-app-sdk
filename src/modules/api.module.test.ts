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

    await module.request("POST", { body: { action: "session.start" } });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      method: "POST",
      body: { action: "session.start" },
    });
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });

  it("defaults a missing method to POST", async () => {
    const { request, module } = makeModule();

    await module.request(undefined, { body: { hello: "world" } });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      method: "POST",
      body: { hello: "world" },
    });
  });

  it("forwards endpoint/query/headers for proxied file calls", async () => {
    const { request, module } = makeModule();

    await module.request("GET", {
      endpoint: "https://files.example/dl",
      query: { id: "1" },
      headers: { Accept: "application/octet-stream" },
    });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      method: "GET",
      endpoint: "https://files.example/dl",
      query: { id: "1" },
      headers: { Accept: "application/octet-stream" },
    });
  });

  it("routes stream:true through sendStreamRequest on the same api.request action", async () => {
    const { request, sendStreamRequest, module } = makeModule();

    await module.request("POST", {
      body: { messages: [{ role: "user", content: "hello" }] },
      stream: true,
    });

    expect(request).not.toHaveBeenCalled();
    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        method: "POST",
        body: { messages: [{ role: "user", content: "hello" }] },
        stream: true,
      },
      undefined,
    );
  });

  it("streams file downloads via endpoint + stream:true", async () => {
    const { sendStreamRequest, module } = makeModule();

    await module.request("GET", {
      endpoint: "https://files.example/dl",
      stream: true,
    });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        method: "GET",
        endpoint: "https://files.example/dl",
        stream: true,
      },
      undefined,
    );
  });

  it("passes no body-specific validation — bodies stay opaque", async () => {
    const { sendStreamRequest, module } = makeModule();

    await expect(
      module.request("POST", { body: { whatever: 1 }, stream: true }),
    ).resolves.toBeDefined();
    expect(sendStreamRequest).toHaveBeenCalledTimes(1);
  });

  it("forwards the AbortSignal for streams", async () => {
    const { sendStreamRequest, module } = makeModule();
    const controller = new AbortController();

    await module.request("POST", {
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
      body: { messages: [{ role: "user", content: "hello" }] },
    });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        method: "POST",
        body: { messages: [{ role: "user", content: "hello" }] },
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
