import { describe, expect, it } from 'vitest';
import { MiniAppSdk } from './MiniAppSdk';
import type { Transport } from '../transport';
import type { PlatformMessage } from '../protocol';
import { createMessage } from '../protocol';
import { HOST_TARGET } from '../constants';
import { SdkError } from '../errors';

/**
 * A minimal scripted `Transport` for exercising `MiniAppSdk` end-to-end.
 * Auto-responds to `handshake` and `platform.getType` (the two requests
 * `initialize()` always makes) and otherwise queues outbound messages so a
 * test can inspect or respond to them manually. No `window`/DOM involved.
 */
class ScriptedTransport implements Transport {
  readonly sent: PlatformMessage[] = [];
  private onMessage: ((message: PlatformMessage) => void) | null = null;
  private readonly platformType: string;

  constructor(platformType: string = 'flutter') {
    this.platformType = platformType;
  }

  start(onMessage: (message: PlatformMessage) => void): void {
    this.onMessage = onMessage;
  }

  stop(): void {
    this.onMessage = null;
  }

  send(message: PlatformMessage): void {
    this.sent.push(message);

    if (message.type === 'handshake') {
      this.reply(message, { status: 'ok' });
      return;
    }
    if (message.namespace === 'platform' && message.action === 'getType') {
      this.reply(message, this.platformType);
      return;
    }
    // Every other request is left pending; the test drives the response.
  }

  reply(request: PlatformMessage, payload: unknown): void {
    const response = createMessage('response', request.namespace, request.action, HOST_TARGET, request.source, payload, {
      requestId: request.requestId,
      traceId: request.traceId,
    });
    queueMicrotask(() => this.onMessage?.(response));
  }
}

describe('MiniAppSdk', () => {
  it('initializes: starts the transport, handshakes, and resolves the platform type', async () => {
    const transport = new ScriptedTransport('flutter');
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });

    await sdk.initialize();

    expect(sdk.platform.type).toBe('flutter');
    expect(sdk.platform.isFlutter()).toBe(true);
    expect(sdk.platform.isMobile()).toBe(true);
    expect(sdk.miniAppId).toBe('my-mini-app');
  });

  it('is idempotent: calling initialize() twice does not re-run the handshake', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });

    await sdk.initialize();
    const handshakeCount = transport.sent.filter((m) => m.type === 'handshake').length;

    await sdk.initialize();
    const handshakeCountAfter = transport.sent.filter((m) => m.type === 'handshake').length;

    expect(handshakeCount).toBe(1);
    expect(handshakeCountAfter).toBe(1);
  });

  it('is concurrency-safe: parallel initialize() calls share one handshake', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });

    await Promise.all([sdk.initialize(), sdk.initialize(), sdk.initialize()]);

    expect(transport.sent.filter((m) => m.type === 'handshake')).toHaveLength(1);
  });

  it('exposes a working auth module end-to-end', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    expect(request.namespace).toBe('auth');
    expect(request.action).toBe('getUser');

    transport.reply(request, { id: 'u1', name: 'Ada', email: 'ada@example.com', roles: [], permissions: [] });

    await expect(userPromise).resolves.toMatchObject({ id: 'u1', name: 'Ada' });
  });

  it('throws SdkError if initialize() is called after destroy()', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    sdk.destroy();

    await expect(sdk.initialize()).rejects.toBeInstanceOf(SdkError);
  });

  it('destroy() is safe to call multiple times', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    expect(() => {
      sdk.destroy();
      sdk.destroy();
    }).not.toThrow();
  });

  it('falls back to DefaultTransport when no transport dependency is provided', () => {
    // DefaultTransport requires `window`; in this Node test environment
    // constructing it should not throw (construction is lazy — only
    // start()/send() touch `window`), proving the SDK still works exactly
    // as before for consumers who don't inject anything.
    expect(() => new MiniAppSdk({ miniAppId: 'my-mini-app' })).not.toThrow();
  });

  it('runs a registered middleware around every module call', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    const seen: string[] = [];
    sdk.use(async (ctx, next) => {
      seen.push(`${ctx.namespace}.${ctx.action}`);
      return next();
    });

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    transport.reply(request, { id: 'u1', name: 'Ada', email: 'ada@example.com', roles: [], permissions: [] });
    await userPromise;

    expect(seen).toEqual(['auth.getUser']);
  });

  it('reports accurate metrics after a mix of successful module calls', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    transport.reply(request, { id: 'u1', name: 'Ada', email: 'ada@example.com', roles: [], permissions: [] });
    await userPromise;

    const metrics = sdk.getMetrics();
    expect(metrics.totalSuccesses).toBeGreaterThanOrEqual(1);
    expect(metrics.byAction['auth.getUser']).toMatchObject({ count: 1, successes: 1 });
  });

  it('lets a host or vendor register and retrieve a custom module', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    sdk.registerModule('payments', (rpc) => ({
      charge: (amount: number) => rpc.request<{ ok: boolean }>('payments', 'charge', { amount }),
    }));

    const payments = sdk.getModule<{ charge(amount: number): Promise<{ ok: boolean }> }>('payments');
    expect(payments).toBeDefined();

    const chargePromise = payments!.charge(100);
    const request = transport.sent[transport.sent.length - 1]!;
    expect(request.namespace).toBe('payments');
    expect(request.action).toBe('charge');
    transport.reply(request, { ok: true });

    await expect(chargePromise).resolves.toEqual({ ok: true });
  });

  it('exposes built-in modules through getModule() by their namespace name', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    expect(sdk.getModule('auth')).toBe(sdk.auth);
  });

  it('getModule() returns undefined for a module that was never registered', async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: 'my-mini-app' }, { transport });
    await sdk.initialize();

    expect(sdk.getModule('does-not-exist')).toBeUndefined();
  });
});
