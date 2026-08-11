import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type { AuthSdkModule, PlatformUser } from "../types";

/**
 * Every module in this directory follows the same shape: a factory function
 * that takes an `RpcClient` and returns an object satisfying the module's
 * public interface. Modules never touch `Transport` directly and never hold
 * their own state — all correlation, retry, and timeout handling lives in
 * `RpcClient`. That keeps each module small, easy to test in isolation, and
 * easy to replace or extend independently of the others.
 */
export function createAuthModule(rpc: RpcClient): AuthSdkModule {
  return {
    getUser: () =>
      rpc.request<PlatformUser | null>(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER),
    isAuthenticated: () =>
      rpc.request<boolean>(NAMESPACES.AUTH, ACTIONS.AUTH.IS_AUTHENTICATED),
    logout: () => rpc.request<void>(NAMESPACES.AUTH, ACTIONS.AUTH.LOGOUT),
  };
}
