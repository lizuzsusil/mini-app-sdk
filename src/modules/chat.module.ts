import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type { ChatMessage, ChatRequestOptions, ChatSdkModule } from "../types";

/**
 * Small helpers for assembling a `ChatMessage[]` without hand-writing
 * literals. Only the roles the wire protocol supports (`user`, `system`) are
 * offered — assistant turns come back from the host model's stream, not from
 * a mini app assembling its own history.
 */
export const ChatMessages = {
  user(content: string): ChatMessage {
    return { role: "user", content };
  },
  system(content: string): ChatMessage {
    return { role: "system", content };
  },
} as const;

/**
 * The AI/chat module. Streams a model completion from the host over the
 * `ai.chat` namespace. The host answers with a sequence of `stream`
 * messages rather than a single response, so this routes through
 * `rpc.sendStreamRequest` and hands the caller a `StreamBuilder` to
 * consume the chunks from. Cancellation is supported two ways: an
 * `AbortSignal` in `requestOptions`, or `builder.cancel()` on the returned
 * builder — both notify the host to stop producing.
 */
export function createChatModule(rpc: RpcClient): ChatSdkModule {
  return {
    chat(messages, options, requestOptions?: ChatRequestOptions) {
      return rpc.sendStreamRequest(
        NAMESPACES.AI,
        ACTIONS.AI.CHAT,
        { messages, options },
        requestOptions,
      );
    },
  };
}
