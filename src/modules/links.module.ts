import { ACTIONS, LINKS_EVENTS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  LinksOpenedEvent,
  LinksOpenOptions,
  LinksSdkModule,
} from "../types";

export function createLinksModule(rpc: RpcClient): LinksSdkModule {
  return {
    isSupported: () => rpc.getCapabilities().includes(NAMESPACES.LINKS),
    open: (url: string, options?: LinksOpenOptions) =>
      rpc.request<void>(NAMESPACES.LINKS, ACTIONS.LINKS.OPEN, {
        url,
        ...options,
      }),
    onOpen: (handler) =>
      rpc.onEvent<LinksOpenedEvent>(LINKS_EVENTS.OPENED, handler),
  };
}
