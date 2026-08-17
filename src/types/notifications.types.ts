/** Payload of `notifications.opened`: what the user tapped, as resolved by the host. */
export interface NotificationOpenEvent {
  /** URL the notification deep-links to, when the host resolved one. */
  url?: string;
  /** Arbitrary data the notification carried, when the host forwards it. */
  data?: Record<string, unknown>;
}

/** Knobs for `NotificationsSdkModule.register()`. */
export interface NotificationsRegisterOptions {
  /** Whether the host should prompt the user for notification permission. Defaults to true. */
  requestPermission?: boolean;
}

/** Result of `NotificationsSdkModule.register()`. */
export interface NotificationsRegisterResult {
  /** Whether notifications are enabled for this mini app. */
  enabled: boolean;
  /** The device push token, when the host has one to hand over. */
  token?: string;
}

/**
 * The notifications module. Gated on the `notifications` capability: call
 * `isSupported()` (or check `sdk.capabilities`) before `register()` so a
 * host that can't push doesn't fail the call. `onToken`/`onOpen` wrap the
 * corresponding host events and are safe to subscribe to regardless of the
 * capability — a host that never emits simply never fires them.
 */
export interface NotificationsSdkModule {
  /** Whether the host negotiated the `notifications` namespace during the handshake. */
  isSupported(): boolean;
  /**
   * Requests notification access and the device push token from the host.
   * The host may prompt the user (see `NotificationsRegisterOptions`).
   */
  register(
    options?: NotificationsRegisterOptions,
  ): Promise<NotificationsRegisterResult>;
  /**
   * Subscribes to push-token delivery. Returns an unsubscribe function.
   * Fires when the host obtains/refreshes the device push token.
   */
  onToken(handler: (token: string) => void): () => void;
  /**
   * Subscribes to notification taps resolved into the mini app. Returns an
   * unsubscribe function.
   */
  onOpen(handler: (event: NotificationOpenEvent) => void): () => void;
}
