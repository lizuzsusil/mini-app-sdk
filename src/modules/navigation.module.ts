import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type { NavigationSdkModule, NavigationState, NavigationTarget } from '../types';

export function createNavigationModule(rpc: RpcClient): NavigationSdkModule {
  return {
    navigate: (target: NavigationTarget) => rpc.request<void>(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.NAVIGATE, target),
    getCurrent: () => rpc.request<NavigationState>(NAMESPACES.NAVIGATION, ACTIONS.NAVIGATION.GET_CURRENT),
  };
}
