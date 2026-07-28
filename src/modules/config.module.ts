import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type { ConfigSdkModule } from '../types';

export function createConfigModule(rpc: RpcClient): ConfigSdkModule {
  return {
    get: <T = unknown>(key: string) => rpc.request<T | undefined>(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET, { key }),
    getAll: () => rpc.request<Record<string, unknown>>(NAMESPACES.CONFIG, ACTIONS.CONFIG.GET_ALL),
  };
}
