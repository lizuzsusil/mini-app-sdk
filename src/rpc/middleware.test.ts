import { describe, expect, it } from 'vitest';
import { composeMiddleware } from './middleware';
import type { RpcMiddleware, RpcMiddlewareContext, RpcNext } from './middleware';

const baseContext: RpcMiddlewareContext = { namespace: 'auth', action: 'getUser', payload: undefined, attempt: 0 };

describe('composeMiddleware', () => {
  it('calls the terminal function directly when there are no middlewares', async () => {
    const result = await composeMiddleware([], baseContext, async () => 'done');
    expect(result).toBe('done');
  });

  it('runs middlewares in registration order on the way in', async () => {
    const order: string[] = [];
    const first: RpcMiddleware = async (_ctx, next) => {
      order.push('first:before');
      const result = await next();
      order.push('first:after');
      return result;
    };
    const second: RpcMiddleware = async (_ctx, next) => {
      order.push('second:before');
      const result = await next();
      order.push('second:after');
      return result;
    };

    await composeMiddleware([first, second], baseContext, async () => {
      order.push('terminal');
      return 'ok';
    });

    expect(order).toEqual(['first:before', 'second:before', 'terminal', 'second:after', 'first:after']);
  });

  it('lets a middleware short-circuit by not calling next()', async () => {
    let terminalCalled = false;
    const shortCircuit: RpcMiddleware = async <T>(_ctx: RpcMiddlewareContext, _next: RpcNext<T>): Promise<T> => {
      return 'short-circuited' as T;
    };

    const result = await composeMiddleware([shortCircuit], baseContext, async () => {
      terminalCalled = true;
      return 'from-terminal';
    });

    expect(result).toBe('short-circuited');
    expect(terminalCalled).toBe(false);
  });

  it('lets a middleware transform the result', async () => {
    const uppercase: RpcMiddleware = async <T>(_ctx: RpcMiddlewareContext, _next: RpcNext<T>): Promise<T> => {
      const result = await _next();
      return (typeof result === 'string' ? result.toUpperCase() : result) as T;
    };

    const result = await composeMiddleware([uppercase], baseContext, async () => 'hello');
    expect(result).toBe('HELLO');
  });

  it('propagates a thrown error up through outer middlewares', async () => {
    const seen: string[] = [];
    const outer: RpcMiddleware = async (_ctx, next) => {
      try {
        return await next();
      } catch (error) {
        seen.push('outer-caught');
        throw error;
      }
    };

    await expect(
      composeMiddleware([outer], baseContext, async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(seen).toEqual(['outer-caught']);
  });

  it('passes the context through to every middleware', async () => {
    const seenContexts: RpcMiddlewareContext[] = [];
    const capture: RpcMiddleware = async (ctx, next) => {
      seenContexts.push(ctx);
      return next();
    };

    await composeMiddleware([capture], baseContext, async () => 'ok');
    expect(seenContexts).toEqual([baseContext]);
  });
});
