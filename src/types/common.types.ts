/** Generic event handler signature used by `MiniAppSdk.on()`. */
export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

/** The host shell the SDK is running inside: Flutter (mobile WebView) or web (Next.js). */
export type PlatformTypeLiteral = 'flutter' | 'web';
