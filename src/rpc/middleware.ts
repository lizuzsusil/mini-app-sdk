export interface RpcMiddlewareContext {
  readonly namespace: string;
  readonly action: string;
  readonly payload: unknown;
  readonly attempt: number;
}

export type RpcNext<T> = () => Promise<T>;

export type RpcMiddleware = <T>(
  context: RpcMiddlewareContext,
  next: RpcNext<T>,
) => Promise<T>;

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
