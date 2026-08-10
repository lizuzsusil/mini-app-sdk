import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type { StorageSdkModule } from "../types";

interface StorageRpcResult {
  value: string | null;
}

export function createStorageModule(rpc: RpcClient): StorageSdkModule {
  return {
    get: (key: string) =>
      rpc
        .request<StorageRpcResult>(NAMESPACES.STORAGE, ACTIONS.STORAGE.GET, {
          key,
        })
        .then((result) => result?.value ?? null),
    set: (key: string, value: string) =>
      rpc.request<void>(NAMESPACES.STORAGE, ACTIONS.STORAGE.SET, {
        key,
        value,
      }),
    remove: (key: string) =>
      rpc.request<void>(NAMESPACES.STORAGE, ACTIONS.STORAGE.REMOVE, { key }),
  };
}
