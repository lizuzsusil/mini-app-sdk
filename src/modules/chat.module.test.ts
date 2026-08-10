import { describe, expect, it, vi } from 'vitest';
import { createChatModule } from './chat.module';
import { ACTIONS, NAMESPACES } from '../constants';
import { StreamBuilder } from '../stream';
import type { RpcClient } from '../rpc';

describe('chat module', () => {
  it('streams a completion via ai.chat with the given messages and options', async () => {
    const builder = new StreamBuilder();
    const sendStreamRequest = vi.fn(async () => builder);
    const rpc = { sendStreamRequest } as unknown as RpcClient;

    const module = createChatModule(rpc);
    const messages = [{ role: 'user' as const, content: 'What is 2+2?' }];
    const options = { model: 'gpt-4o', temperature: 0.5 };

    await expect(module.chat(messages, options)).resolves.toBe(builder);

    expect(sendStreamRequest).toHaveBeenCalledWith(NAMESPACES.AI, ACTIONS.AI.CHAT, { messages, options });
  });

  it('omits options when the caller does not provide them', async () => {
    const sendStreamRequest = vi.fn(async () => new StreamBuilder());
    const rpc = { sendStreamRequest } as unknown as RpcClient;

    const module = createChatModule(rpc);
    await module.chat([{ role: 'system', content: 'You are helpful' }]);

    expect(sendStreamRequest).toHaveBeenCalledWith(NAMESPACES.AI, ACTIONS.AI.CHAT, {
      messages: [{ role: 'system', content: 'You are helpful' }],
      options: undefined,
    });
  });
});
