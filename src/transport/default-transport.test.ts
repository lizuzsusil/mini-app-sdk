// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DefaultTransport } from './default-transport';
import { createMessage } from '../protocol';
import { HOST_TARGET } from '../constants';

function dispatchMessageFromOrigin(origin: string, data: unknown) {
  const event = new MessageEvent('message', { data, origin });
  window.dispatchEvent(event);
}

describe('DefaultTransport — origin validation', () => {
  it('accepts the first inbound message regardless of origin, then pins that origin', () => {
    const transport = new DefaultTransport();
    const received: unknown[] = [];
    transport.start((message) => received.push(message));

    const first = createMessage('handshake', 'handshake', 'connect', HOST_TARGET, 'my-app');
    dispatchMessageFromOrigin('https://shell.example.gov', first);
    expect(received).toHaveLength(1);

    // a later message from a *different* origin is now rejected
    const second = createMessage('event', 'notification', 'received', HOST_TARGET, 'my-app');
    dispatchMessageFromOrigin('https://attacker.example', second);
    expect(received).toHaveLength(1);

    // but one from the pinned origin still goes through
    const third = createMessage('event', 'notification', 'received', HOST_TARGET, 'my-app');
    dispatchMessageFromOrigin('https://shell.example.gov', third);
    expect(received).toHaveLength(2);

    transport.stop();
  });

  it('enforces an explicitly configured allowedOrigin from the very first message', () => {
    const transport = new DefaultTransport({ allowedOrigin: 'https://shell.example.gov' });
    const received: unknown[] = [];
    transport.start((message) => received.push(message));

    const fromWrongOrigin = createMessage('handshake', 'handshake', 'connect', HOST_TARGET, 'my-app');
    dispatchMessageFromOrigin('https://attacker.example', fromWrongOrigin);
    expect(received).toHaveLength(0);

    const fromRightOrigin = createMessage('handshake', 'handshake', 'connect', HOST_TARGET, 'my-app');
    dispatchMessageFromOrigin('https://shell.example.gov', fromRightOrigin);
    expect(received).toHaveLength(1);

    transport.stop();
  });

  it('sends outbound messages to "*" until an origin has been pinned', () => {
    const transport = new DefaultTransport();
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');
    transport.start(() => {});

    const message = createMessage('handshake', 'handshake', 'connect', 'my-app', HOST_TARGET);
    transport.send(message);

    expect(postMessageSpy).toHaveBeenCalledWith(message, '*');
    transport.stop();
    postMessageSpy.mockRestore();
  });

  it('sends outbound messages directly to the pinned origin once one is known', () => {
    const transport = new DefaultTransport();
    const postMessageSpy = vi.spyOn(window.parent, 'postMessage');
    transport.start(() => {});

    dispatchMessageFromOrigin('https://shell.example.gov', createMessage('handshake', 'handshake', 'connect', HOST_TARGET, 'my-app'));

    const message = createMessage('request', 'auth', 'getUser', 'my-app', HOST_TARGET);
    transport.send(message);

    expect(postMessageSpy).toHaveBeenCalledWith(message, 'https://shell.example.gov');
    transport.stop();
    postMessageSpy.mockRestore();
  });
});
