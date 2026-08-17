import { describe, expect, it, vi } from "vitest";
import { ACTIONS, HTTP_EVENTS, NAMESPACES } from "../constants";
import { HttpClientError, HttpServerError } from "../errors";
import type { RpcClient } from "../rpc";
import { StreamBuilder } from "../stream";
import { createHttpModule } from "./http.module";

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
    async (_namespace: string, _action: string, _payload?: unknown) =>
      new StreamBuilder(),
  );
  const onEvent = vi.fn(
    (_event: string, _handler: (payload: unknown) => void) => () => {},
  );
  const rpc = {
    request,
    sendStreamRequest,
    onEvent,
  } as unknown as RpcClient;
  return { rpc, request, sendStreamRequest, onEvent, module: createHttpModule(rpc) };
}

/** Invokes a request's captured `mapPayload` and returns whatever it threw. */
function thrownBy(
  request: ReturnType<typeof makeModule>["request"],
  result: unknown,
): unknown {
  const options = request.mock.calls[0]![3] as {
    mapPayload: (payload: unknown) => unknown;
  };
  try {
    options.mapPayload(result);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("http module typed errors", () => {
  it("passes a mapPayload to every verb so the RPC layer can apply it in the retry loop", async () => {
    const { request, module } = makeModule();

    await module.get({ endpoint: "/items" });

    const options = request.mock.calls[0]![3] as {
      mapPayload?: (payload: unknown) => unknown;
    };
    expect(options.mapPayload).toBeTypeOf("function");
  });

  it("turns a 4xx result into a non-retryable HttpClientError", async () => {
    const { request, module } = makeModule();

    await module.get({ endpoint: "/items" });

    const caught = thrownBy(request, { status: 404, data: null, headers: {} });
    expect(caught).toBeInstanceOf(HttpClientError);
    expect(caught).toMatchObject({ status: 404, retryable: false });
  });

  it("turns a 5xx result into a retryable HttpServerError", async () => {
    const { request, module } = makeModule();

    await module.get({ endpoint: "/items" });

    const caught = thrownBy(request, { status: 503, data: null, headers: {} });
    expect(caught).toBeInstanceOf(HttpServerError);
    expect(caught).toMatchObject({ status: 503, retryable: true });
  });

  it("passes successful results through unchanged", async () => {
    const { request, module } = makeModule();

    await module.get({ endpoint: "/items" });

    const result = { status: 200, data: { id: 1 }, headers: {} };
    expect(thrownBy(request, result)).toBeUndefined();
  });
});

describe("http module streaming", () => {
  it("routes getStream through sendStreamRequest on the http.getStream action", async () => {
    const { sendStreamRequest, module } = makeModule();

    await module.getStream({ endpoint: "/download" });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.HTTP,
      ACTIONS.HTTP.GET_STREAM,
      { endpoint: "/download" },
    );
  });
});

describe("http module upload progress", () => {
  it("subscribes to upload progress and unsubscribes once the request settles", async () => {
    const unsubscribe = vi.fn();
    const onEvent = vi.fn(
      (_event: string, _handler: (payload: unknown) => void) => unsubscribe,
    );
    const rpc = {
      request: vi.fn(
        async (
          _namespace: string,
          _action: string,
          _payload?: unknown,
          _options?: unknown,
        ) => ({ status: 201, data: null, headers: {} }),
      ),
      sendStreamRequest: vi.fn(),
      onEvent,
    } as unknown as RpcClient;
    const module = createHttpModule(rpc);
    const onProgress = vi.fn();

    await module.post({ endpoint: "/upload", body: "payload" }, { onProgress });

    expect(onEvent).toHaveBeenCalledWith(
      HTTP_EVENTS.UPLOAD_PROGRESS,
      expect.any(Function),
    );
    const handler = onEvent.mock.calls[0]![1];
    handler({ uploadedBytes: 10, totalBytes: 100 });
    expect(onProgress).toHaveBeenCalledWith({
      uploadedBytes: 10,
      totalBytes: 100,
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe to upload progress when no callback is given", async () => {
    const { onEvent, module } = makeModule();

    await module.post({ endpoint: "/upload", body: "payload" });

    expect(onEvent).not.toHaveBeenCalled();
  });
});