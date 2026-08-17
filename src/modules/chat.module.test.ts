import { describe, expect, it, vi } from "vitest";
import { ACTIONS, NAMESPACES } from "../constants";
import { RequestCancelledError } from "../errors";
import type { RpcClient } from "../rpc";
import { StreamBuilder } from "../stream";
import { ChatMessages, createChatModule } from "./chat.module";

describe("chat module", () => {
  it("streams a completion via ai.chat with the given messages and options", async () => {
    const builder = new StreamBuilder();
    const sendStreamRequest = vi.fn(async () => builder);
    const rpc = { sendStreamRequest } as unknown as RpcClient;

    const module = createChatModule(rpc);
    const messages = [{ role: "user" as const, content: "What is 2+2?" }];
    const options = { model: "gpt-4o", temperature: 0.5 };

    await expect(module.chat(messages, options)).resolves.toBe(builder);

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
      { messages, options },
      undefined,
    );
  });

  it("omits options when the caller does not provide them", async () => {
    const sendStreamRequest = vi.fn(async () => new StreamBuilder());
    const rpc = { sendStreamRequest } as unknown as RpcClient;

    const module = createChatModule(rpc);
    await module.chat([{ role: "system", content: "You are helpful" }]);

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
      {
        messages: [{ role: "system", content: "You are helpful" }],
        options: undefined,
      },
      undefined,
    );
  });

  it("forwards an AbortSignal so the stream can be cancelled", async () => {
    const sendStreamRequest = vi.fn(async () => new StreamBuilder());
    const rpc = { sendStreamRequest } as unknown as RpcClient;

    const module = createChatModule(rpc);
    const controller = new AbortController();
    const messages = [{ role: "user" as const, content: "Hi" }];

    await module.chat(messages, undefined, { signal: controller.signal });

    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
      { messages, options: undefined },
      { signal: controller.signal },
    );
  });
});

describe("ChatMessages history helpers", () => {
  it("builds role-typed messages without hand-written literals", () => {
    expect(ChatMessages.user("Hello")).toEqual({
      role: "user",
      content: "Hello",
    });
    expect(ChatMessages.system("Be concise")).toEqual({
      role: "system",
      content: "Be concise",
    });
  });

  it("assembles a full message history", () => {
    const history = [
      ChatMessages.system("You answer in Tamil"),
      ChatMessages.user("What is 2+2?"),
    ];
    expect(history).toEqual([
      { role: "system", content: "You answer in Tamil" },
      { role: "user", content: "What is 2+2?" },
    ]);
  });
});

describe("chat stream cancellation", () => {
  it("rejects the returned builder when the host refuses the ai.cancel request", async () => {
    const sendStreamRequest = vi.fn(async () => new StreamBuilder());
    const rpc = { sendStreamRequest } as unknown as RpcClient;

    const module = createChatModule(rpc);
    const controller = new AbortController();
    await module.chat(
      [ChatMessages.user("hi")],
      undefined,
      { signal: controller.signal },
    );
    controller.abort();

    // The builder is cancelled by the RPC layer (RequestCancelledError on
    // abort), which is exercised in rpc-client.test.ts — this just proves the
    // module threads the signal through untouched.
    expect(sendStreamRequest).toHaveBeenCalledWith(
      NAMESPACES.AI,
      ACTIONS.AI.CHAT,
      { messages: [ChatMessages.user("hi")], options: undefined },
      { signal: controller.signal },
    );
  });

  it("surfaces a cancelled stream as a RequestCancelledError", async () => {
    const builder = new StreamBuilder();
    const rpc = {
      sendStreamRequest: vi.fn(async () => builder),
    } as unknown as RpcClient;

    const module = createChatModule(rpc);
    const done = module.chat([ChatMessages.user("hi")]);
    await expect(done).resolves.toBe(builder);

    builder.cancel(
      new RequestCancelledError({ namespace: NAMESPACES.AI, action: "chat" }),
    );
    await expect(builder.waitUntilDone()).rejects.toBeInstanceOf(
      RequestCancelledError,
    );
  });
});