import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type { FlagsSdkModule } from '../types';

export function createFlagsModule(rpc: RpcClient): FlagsSdkModule {
  return {
    isEnabled: (flag: string) => rpc.request<boolean>(NAMESPACES.FLAGS, ACTIONS.FLAGS.IS_ENABLED, { flag }),
    getAll: () => rpc.request<Record<string, boolean>>(NAMESPACES.FLAGS, ACTIONS.FLAGS.GET_ALL),
  };
}
