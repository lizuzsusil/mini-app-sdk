import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type { AuthSdkModule, PlatformUser } from "../types";

export function createAuthModule(rpc: RpcClient): AuthSdkModule {
  return {
    getUser: () =>
      rpc.request<PlatformUser | null>(NAMESPACES.AUTH, ACTIONS.AUTH.GET_USER),
    isAuthenticated: () =>
      rpc.request<boolean>(NAMESPACES.AUTH, ACTIONS.AUTH.IS_AUTHENTICATED),
    logout: () => rpc.request<void>(NAMESPACES.AUTH, ACTIONS.AUTH.LOGOUT),
  };
}
