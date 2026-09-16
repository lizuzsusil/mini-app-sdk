import { describe, expect, it, vi } from "vitest";
import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import { StreamBuilder } from "../stream";
import { createApiModule, DEFAULT_CHAT_CHANNEL } from "./api.module";

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
  const rpc = { request, sendStreamRequest } as unknown as RpcClient;
  return { rpc, request, sendStreamRequest, module: createApiModule(rpc) };
}

describe("api module", () => {
  it("routes unary methods through rpc.request unchanged", async () => {
    const { request, sendStreamRequest, module } = makeModule();

    await module.request({ method: "POST", body: { method: "POST", path: "/api/mock/session" } });

    expect(request).toHaveBeenCalledWith(NAMESPACES.API, ACTIONS.API.REQUEST, {
      method: "POST",
      body: { method: "POST", path: "/api/mock/session" },
    });
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });

  it("routes STREAM through sendStreamRequest on the same api.request action", async () => {
    const { sendStreamRequest, module } = makeModule();

    await module.request({
      method: "STREAM",
      body: { channel: "gic", user_id: "u1", session_id: "s1", message: "hi" },
    } as unknown as Parameters<typeof module.request>[0]);

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        method: "STREAM",
        body: { channel: "gic", user_id: "u1", session_id: "s1", message: "hi" },
      },
      undefined,
    );
  });

  it("defaults a missing channel to generic", async () => {
    const { sendStreamRequest, module } = makeModule();
    expect(DEFAULT_CHAT_CHANNEL).toBe("generic");

    await module.request({
      method: "STREAM",
      body: { messages: [{ role: "user", content: "hello" }] },
    } as unknown as Parameters<typeof module.request>[0]);

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      {
        method: "STREAM",
        body: { messages: [{ role: "user", content: "hello" }], channel: "generic" },
      },
      undefined,
    );
  });

  it("falls back to gic on GIC-shaped bodies without a channel", async () => {
    const { sendStreamRequest, module } = makeModule();

    await module.request({
      method: "STREAM",
      body: { user_id: "u1", session_id: "s1", message: "hi" },
    } as unknown as Parameters<typeof module.request>[0]);

    const payload = sendStreamRequest.mock.calls[0]![2] as { body: { channel: string } };
    expect(payload.body.channel).toBe("gic");
  });

  it("forwards the stream AbortSignal", async () => {
    const { sendStreamRequest, module } = makeModule();
    const controller = new AbortController();

    await module.request({
      method: "STREAM",
      body: { messages: [{ role: "user", content: "hello" }] },
      stream: { signal: controller.signal },
    } as unknown as Parameters<typeof module.request>[0]);

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.API,
      ACTIONS.API.REQUEST,
      expect.objectContaining({ method: "STREAM" }),
      { signal: controller.signal },
    );
  });

  it("rejects blank gic messages with INVALID_PARAMS", async () => {
    const { sendStreamRequest, module } = makeModule();

    await expect(
      module.request({
        method: "STREAM",
        body: { channel: "gic", user_id: "u1", session_id: "s1", message: "  " },
      } as unknown as Parameters<typeof module.request>[0]),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });

  it("rejects empty generic message lists with INVALID_PARAMS", async () => {
    const { sendStreamRequest, module } = makeModule();

    await expect(
      module.request({
        method: "STREAM",
        body: { messages: [] },
      } as unknown as Parameters<typeof module.request>[0]),
    ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    expect(sendStreamRequest).not.toHaveBeenCalled();
  });
});
