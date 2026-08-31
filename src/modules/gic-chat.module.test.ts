import { afterEach, describe, expect, it, vi } from "vitest";
import { NAMESPACES, ACTIONS } from "../constants";
import type { RpcClient } from "../rpc";
import { createGicChatModule } from "./gic-chat.module";

function makeRpcClient(overrides: Partial<RpcClient> = {}): RpcClient {
  return {
    request: vi.fn(),
    sendStreamRequest: vi.fn(),
    ...overrides,
  } as unknown as RpcClient;
}

function fakeStreamBuilder(chunks: string[]) {
  let index = 0;
  return {
    iterate: vi.fn(async function* () {
      for (const chunk of chunks) {
        yield chunk;
        index++;
      }
    }),
    waitUntilDone: vi.fn(async () => {}),
    cancel: vi.fn(),
    get isDone() {
      return index >= chunks.length;
    },
  };
}

function fakeStreamBuilderWithError(
  chunks: string[],
  errorMsg: string,
  errorIndex?: number,
) {
  const errorAt = errorIndex ?? chunks.length;
  const shouldError = chunks.length === 0 || errorAt < chunks.length;
  return {
    iterate: vi.fn(async function* () {
      if (chunks.length === 0 && shouldError) {
        throw new Error(errorMsg);
      }
      for (let i = 0; i < chunks.length; i++) {
        if (i === errorAt) throw new Error(errorMsg);
        yield chunks[i];
      }
    }),
    waitUntilDone: vi.fn(async () => {
      if (shouldError) throw new Error(errorMsg);
    }),
    cancel: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createGicChatModule", () => {
  describe("startSession", () => {
    it("calls rpc.request with GIC_CHAT namespace and START_SESSION action", async () => {
      const rpc = makeRpcClient({
        request: vi.fn().mockResolvedValue({
          status: "success",
          user_id: "user-1",
          session_id: "session-1",
        }),
      });
      const mod = createGicChatModule(rpc);

      const result = await mod.startSession();

      expect(rpc.request).toHaveBeenCalledWith(
        NAMESPACES.GIC_CHAT,
        ACTIONS.GIC_CHAT.START_SESSION,
      );
      expect(result).toEqual({
        status: "success",
        user_id: "user-1",
        session_id: "session-1",
      });
    });

    it("throws HOST_ERROR when response is missing user_id", async () => {
      const rpc = makeRpcClient({
        request: vi.fn().mockResolvedValue({ session_id: "s1" }),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.startSession()).rejects.toMatchObject({
        code: "HOST_ERROR",
      });
    });

    it("throws HOST_ERROR when response is missing session_id", async () => {
      const rpc = makeRpcClient({
        request: vi.fn().mockResolvedValue({ user_id: "u1" }),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.startSession()).rejects.toMatchObject({
        code: "HOST_ERROR",
      });
    });

    it("throws HOST_ERROR when response is null", async () => {
      const rpc = makeRpcClient({
        request: vi.fn().mockResolvedValue(null),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.startSession()).rejects.toMatchObject({
        code: "HOST_ERROR",
      });
    });

    it("propagates transport-level errors", async () => {
      const rpc = makeRpcClient({
        request: vi.fn().mockRejectedValue(new Error("network")),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.startSession()).rejects.toThrow("network");
    });
  });

  describe("stream", () => {
    const validRequest = {
      user_id: "user-1",
      session_id: "session-1",
      message: "Hello",
    };

    it("throws INVALID_PARAMS when user_id is missing", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.stream({ session_id: "s1", message: "Hi" } as Parameters<typeof mod.stream>[0]),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("throws INVALID_PARAMS when session_id is missing", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.stream({ user_id: "u1", message: "Hi" } as Parameters<typeof mod.stream>[0]),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("throws INVALID_PARAMS when message is blank", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.stream({ user_id: "u1", session_id: "s1", message: "   " }),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("throws INVALID_PARAMS when message exceeds 200 characters", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.stream({
          user_id: "u1",
          session_id: "s1",
          message: "x".repeat(201),
        }),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("accepts message of exactly 200 characters", async () => {
      const builder = fakeStreamBuilder([
        JSON.stringify({ type: "token", text: "Hi" }),
        JSON.stringify({ type: "done" }),
      ]);
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await expect(
        mod.stream({
          user_id: "u1",
          session_id: "s1",
          message: "x".repeat(200),
        }),
      ).resolves.toEqual({ invocation_id: undefined });
    });

    it("sends correct namespace and action via sendStreamRequest", async () => {
      const builder = fakeStreamBuilder([
        JSON.stringify({ type: "done" }),
      ]);
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await mod.stream(validRequest);

      expect(rpc.sendStreamRequest).toHaveBeenCalledWith(
        NAMESPACES.GIC_CHAT,
        ACTIONS.GIC_CHAT.STREAM,
        validRequest,
        undefined,
      );
    });

    it("passes AbortSignal through to sendStreamRequest", async () => {
      const controller = new AbortController();
      const builder = fakeStreamBuilder([
        JSON.stringify({ type: "done" }),
      ]);
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await mod.stream(validRequest, { signal: controller.signal });

      expect(rpc.sendStreamRequest).toHaveBeenCalledWith(
        NAMESPACES.GIC_CHAT,
        ACTIONS.GIC_CHAT.STREAM,
        validRequest,
        { signal: controller.signal },
      );
    });

    it("calls onEvent for each parsed GicChatEvent", async () => {
      const events = [
        { type: "tool_call" },
        { type: "tool_result" },
        { type: "keep_alive" },
        { type: "token", text: "Hello" },
        { type: "token", text: " world" },
        { type: "meta", invocation_id: "inv-1" },
        { type: "done" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);
      const onEvent = vi.fn();

      await mod.stream(validRequest, { onEvent });

      expect(onEvent).toHaveBeenCalledTimes(7);
      expect(onEvent).toHaveBeenNthCalledWith(1, { type: "tool_call" });
      expect(onEvent).toHaveBeenNthCalledWith(2, { type: "tool_result" });
      expect(onEvent).toHaveBeenNthCalledWith(3, { type: "keep_alive" });
      expect(onEvent).toHaveBeenNthCalledWith(4, {
        type: "token",
        text: "Hello",
      });
      expect(onEvent).toHaveBeenNthCalledWith(5, {
        type: "token",
        text: " world",
      });
      expect(onEvent).toHaveBeenNthCalledWith(6, {
        type: "meta",
        invocation_id: "inv-1",
      });
      expect(onEvent).toHaveBeenNthCalledWith(7, { type: "done" });
    });

    it("returns invocation_id from meta event", async () => {
      const events = [
        { type: "token", text: "Hi" },
        { type: "meta", invocation_id: "inv-abc" },
        { type: "done" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      const result = await mod.stream(validRequest);

      expect(result).toEqual({ invocation_id: "inv-abc" });
    });

    it("returns undefined invocation_id when no meta event", async () => {
      const events = [
        { type: "token", text: "Hi" },
        { type: "done" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      const result = await mod.stream(validRequest);

      expect(result).toEqual({ invocation_id: undefined });
    });

    it("throws HOST_ERROR on error event with detail", async () => {
      const events = [
        { type: "token", text: "partial" },
        { type: "error", detail: "rate limit exceeded" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.stream(validRequest)).rejects.toMatchObject({
        code: "HOST_ERROR",
        message: "rate limit exceeded",
      });
    });

    it("throws HOST_ERROR on error event without detail", async () => {
      const events = [{ type: "error" }];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.stream(validRequest)).rejects.toMatchObject({
        code: "HOST_ERROR",
        message: "GIC chat stream error",
      });
    });

    it("skips invalid JSON chunks without crashing", async () => {
      const events = [
        "not-json",
        JSON.stringify({ type: "token", text: "ok" }),
        "another-bad-chunk",
        JSON.stringify({ type: "done" }),
      ];
      const builder = fakeStreamBuilder(events);
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);
      const onEvent = vi.fn();

      const result = await mod.stream(validRequest, { onEvent });

      expect(onEvent).toHaveBeenCalledTimes(2);
      expect(onEvent).toHaveBeenCalledWith({ type: "token", text: "ok" });
      expect(onEvent).toHaveBeenCalledWith({ type: "done" });
      expect(result).toEqual({ invocation_id: undefined });
    });

    it("stops iteration when done event is received", async () => {
      const events = [
        { type: "token", text: "first" },
        { type: "done" },
        { type: "token", text: "after-done" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);
      const onEvent = vi.fn();

      await mod.stream(validRequest, { onEvent });

      expect(onEvent).toHaveBeenCalledTimes(2);
      expect(onEvent).toHaveBeenNthCalledWith(1, {
        type: "token",
        text: "first",
      });
      expect(onEvent).toHaveBeenNthCalledWith(2, { type: "done" });
    });

    it("propagates stream builder rejection", async () => {
      const builder = fakeStreamBuilderWithError([], "transport lost", 0);
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.stream(validRequest)).rejects.toThrow(
        "transport lost",
      );
    });
  });

  describe("streamText", () => {
    const validRequest = {
      user_id: "user-1",
      session_id: "session-1",
      message: "Hello",
    };

    it("accumulates token text and returns full text", async () => {
      const events = [
        { type: "tool_call" },
        { type: "tool_result" },
        { type: "keep_alive" },
        { type: "token", text: "To apply " },
        { type: "token", text: "for a new" },
        { type: "token", text: " NIC," },
        { type: "meta", invocation_id: "inv-stream-text" },
        { type: "done" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      const result = await mod.streamText(validRequest);

      expect(result).toEqual({
        text: "To apply for a new NIC,",
        invocation_id: "inv-stream-text",
      });
    });

    it("calls onEvent for each event", async () => {
      const events = [
        { type: "token", text: "Hi" },
        { type: "meta", invocation_id: "inv-2" },
        { type: "done" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);
      const onEvent = vi.fn();

      await mod.streamText(validRequest, { onEvent });

      expect(onEvent).toHaveBeenCalledTimes(3);
    });

    it("returns empty text when no token events", async () => {
      const events = [{ type: "done" }];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      const result = await mod.streamText(validRequest);

      expect(result).toEqual({ text: "" });
    });

    it("throws INVALID_PARAMS when user_id is missing", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.streamText({ session_id: "s1", message: "Hi" } as Parameters<typeof mod.streamText>[0]),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("throws INVALID_PARAMS when message is blank", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.streamText({ user_id: "u1", session_id: "s1", message: "  " }),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("throws INVALID_PARAMS when message exceeds 200 characters", async () => {
      const rpc = makeRpcClient();
      const mod = createGicChatModule(rpc);

      await expect(
        mod.streamText({
          user_id: "u1",
          session_id: "s1",
          message: "y".repeat(201),
        }),
      ).rejects.toMatchObject({ code: "INVALID_PARAMS" });
    });

    it("throws HOST_ERROR on error event", async () => {
      const events = [
        { type: "token", text: "partial" },
        { type: "error", detail: "model overloaded" },
      ];
      const builder = fakeStreamBuilder(events.map((e) => JSON.stringify(e)));
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.streamText(validRequest)).rejects.toMatchObject({
        code: "HOST_ERROR",
        message: "model overloaded",
      });
    });

    it("propagates transport-level errors", async () => {
      const builder = fakeStreamBuilderWithError([], "connection reset", 0);
      const rpc = makeRpcClient({
        sendStreamRequest: vi.fn().mockResolvedValue(builder),
      });
      const mod = createGicChatModule(rpc);

      await expect(mod.streamText(validRequest)).rejects.toThrow(
        "connection reset",
      );
    });
  });
});
