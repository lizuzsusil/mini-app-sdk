import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  NavigationRouterResult,
  NavigationRouterSdkModule,
  NavigationSdkModule,
  NavigationState,
  NavigationTarget,
} from "../types";

/**
 * Coerces the host's reply into a `NavigationRouterResult`.
 *
 * Hosts answer this call in one of three shapes: the full
 * `{ consumed }` object, a bare boolean, or nothing at all (a shell that
 * treats `back`/`push` as fire-and-forget and just acknowledges the
 * request). Falling back to the flag the caller sent keeps the promise
 * resolving to a usable object on every shell, so mini-app code can read
 * `result.consumed` unconditionally instead of guarding for `undefined`.
 */
function toRouterResult(
  raw: unknown,
  requested: boolean,
): NavigationRouterResult {
  if (typeof raw === "boolean") return { consumed: raw };
  if (raw && typeof raw === "object") {
    const { consumed } = raw as Partial<NavigationRouterResult>;
    if (typeof consumed === "boolean") return { consumed };
  }
  return { consumed: requested };
}

/**
 * The mini app's own router, mirrored to the host.
 *
 * `navigate()` asks the host to move *the platform* somewhere; these two
 * instead report a move the mini app is making *inside itself*, and the
 * boolean is the whole point of them. On `navigation.back.requested` the
 * host is holding the native back press, waiting to hear whether the mini
 * app handled it:
 *
 * ```ts
 * sdk.on(NAVIGATION_EVENTS.BACK_REQUESTED, async () => {
 *   const { history } = await sdk.navigation.getCurrent();
 *   // true  -> mini app popped a route, host keeps the container open
 *   // false -> mini app is at its root, host exits the container
 *   await sdk.navigation.router.back(history.length > 1);
 * });
 * ```
 */
function createNavigationRouter(rpc: RpcClient): NavigationRouterSdkModule {
  return {
    /**
     * Reports a back step. Pass `false` when the mini app has no history
     * left, which hands the back press back to the host.
     */
    async back(consumed = true): Promise<NavigationRouterResult> {
      const raw = await rpc.request<unknown>(
        NAMESPACES.NAVIGATION,
        ACTIONS.NAVIGATION.BACK,
        { consumed },
      );
      return toRouterResult(raw, consumed);
    },

    /**
     * Reports a forward step, so the host learns the mini app now has
     * history to pop and keeps the container open on the next back press.
     */
    async push(consumed = true): Promise<NavigationRouterResult> {
      const raw = await rpc.request<unknown>(
        NAMESPACES.NAVIGATION,
        ACTIONS.NAVIGATION.PUSH,
        { consumed },
      );
      return toRouterResult(raw, consumed);
    },
  };
}

export function createNavigationModule(rpc: RpcClient): NavigationSdkModule {
  return {
    navigate: (target: NavigationTarget) =>
      rpc.request<void>(
        NAMESPACES.NAVIGATION,
        ACTIONS.NAVIGATION.NAVIGATE,
        target,
      ),
    getCurrent: () =>
      rpc.request<NavigationState>(
        NAMESPACES.NAVIGATION,
        ACTIONS.NAVIGATION.GET_CURRENT,
      ),
    router: createNavigationRouter(rpc),
  };
}
