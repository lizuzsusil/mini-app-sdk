/** Generic event handler signature used by `MiniAppSdk.on()`. */
export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

/** The three host platforms the SDK can currently run under. */
export type PlatformTypeLiteral = 'WEB' | 'ANDROID' | 'IOS';
