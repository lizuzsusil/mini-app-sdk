import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type { PermissionsSdkModule } from "../types";

export function createPermissionsModule(rpc: RpcClient): PermissionsSdkModule {
  return {
    has: (permission: string) =>
      rpc.request<boolean>(NAMESPACES.PERMISSIONS, ACTIONS.PERMISSIONS.HAS, {
        permission,
      }),
    list: () =>
      rpc.request<string[]>(NAMESPACES.PERMISSIONS, ACTIONS.PERMISSIONS.LIST),
  };
}
