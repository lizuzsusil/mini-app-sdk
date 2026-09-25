import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  NavigationRouterResult,
  NavigationRouterSdkModule,
  NavigationSdkModule,
  NavigationState,
  NavigationTarget,
} from "../types";

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

function createNavigationRouter(rpc: RpcClient): NavigationRouterSdkModule {
  return {
    // back take and boolean params, works when true
    async back(consumed = true): Promise<NavigationRouterResult> {
      const raw = await rpc.request<unknown>(
        NAMESPACES.NAVIGATION,
        ACTIONS.NAVIGATION.ROUTER,
        { consumed },
      );
      return toRouterResult(raw, consumed);
    },

    async push(consumed = true): Promise<NavigationRouterResult> {
      const raw = await rpc.request<unknown>(
        NAMESPACES.NAVIGATION,
        ACTIONS.NAVIGATION.ROUTER,
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
