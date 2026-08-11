/**
 * Everything a middleware knows about the request it's wrapping. Deliberately
 * a plain, serializable-ish shape — a middleware shouldn't need to reach
 * into `RpcClient` internals to decide what to do with a call.
 */
export interface RpcMiddlewareContext {
  readonly namespace: string;
  readonly action: string;
  readonly payload: unknown;
  /** Which attempt this is, 0-indexed. Middleware wrapping the outer request only ever sees attempt 0 — see the module doc comment for why. */
  readonly attempt: number;
}

/** Calls the next middleware in the chain (or the actual request, if this is the last one) and returns its result. */
export type RpcNext<T> = () => Promise<T>;

/**
 * A middleware wraps a request: it can inspect the context, run code before
 * and after, short-circuit by not calling `next()`, or transform the
 * result/error. Middleware compose like Express/Koa handlers — each one
 * decides whether and when to call `next()`.
 *
 * ```ts
 * const loggingMiddleware: RpcMiddleware = async (ctx, next) => {
 *   const start = Date.now();
 *   try {
 *     return await next();
 *   } finally {
 *     console.log(`${ctx.namespace}.${ctx.action} took ${Date.now() - start}ms`);
 *   }
 * };
 * ```
 */
export type RpcMiddleware = <T>(
  context: RpcMiddlewareContext,
  next: RpcNext<T>,
) => Promise<T>;

/**
 * Builds a single callable from a list of middlewares plus a terminal
 * function (the actual request). Middlewares run in registration order on
 * the way in — the first one registered is the outermost wrapper — and
 * unwind in reverse order on the way out, exactly like Koa's `compose`.
 *
 * Applied once per logical request (i.e. wraps the whole retry loop, not
 * each individual attempt) — a middleware that measures duration or logs a
 * call should see one entry per `sdk.auth.getUser()` call a mini app makes,
 * not one entry per retry attempt underneath it.
 */
export function composeMiddleware<T>(
  middlewares: readonly RpcMiddleware[],
  context: RpcMiddlewareContext,
  terminal: RpcNext<T>,
): Promise<T> {
  let index = -1;

  function dispatch(i: number): Promise<T> {
    if (i <= index) {
      throw new Error("next() called multiple times in one middleware");
    }
    index = i;

    const middleware = middlewares[i];
    if (!middleware) {
      return terminal();
    }
    return middleware(context, () => dispatch(i + 1));
  }

  return dispatch(0);
}
