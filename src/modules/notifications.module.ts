import { ACTIONS, NAMESPACES, NOTIFICATIONS_EVENTS } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  NotificationOpenEvent,
  NotificationsRegisterOptions,
  NotificationsRegisterResult,
  NotificationsSdkModule,
} from "../types";

export function createNotificationsModule(
  rpc: RpcClient,
): NotificationsSdkModule {
  return {
    isSupported: () => rpc.getCapabilities().includes(NAMESPACES.NOTIFICATIONS),
    register: (options?: NotificationsRegisterOptions) =>
      rpc.request<NotificationsRegisterResult>(
        NAMESPACES.NOTIFICATIONS,
        ACTIONS.NOTIFICATIONS.REGISTER,
        options,
      ),
    onToken: (handler) =>
      rpc.onEvent<string>(NOTIFICATIONS_EVENTS.TOKEN, handler),
    onOpen: (handler) =>
      rpc.onEvent<NotificationOpenEvent>(NOTIFICATIONS_EVENTS.OPENED, handler),
  };
}
