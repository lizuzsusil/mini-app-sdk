import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type { ChatSdkModule } from '../types';

/**
 * The AI/chat module. Streams a model completion from the host over the
 * `ai.chat` namespace. The host answers with a sequence of `stream`
 * messages rather than a single response, so this routes through
 * `rpc.sendStreamRequest` and hands the caller a `StreamBuilder` to
 * consume the chunks from.
 */
export function createChatModule(rpc: RpcClient): ChatSdkModule {
  return {
    chat(messages, options) {
      return rpc.sendStreamRequest(NAMESPACES.AI, ACTIONS.AI.CHAT, { messages, options });
    },
  };
}
