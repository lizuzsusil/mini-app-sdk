import type { LocaleState, ThemeState } from "@lizuz/mini-app-types";
import type { HttpProgress } from "./http.types";
import type { LinksOpenedEvent } from "./links.types";
import type { NotificationOpenEvent } from "./notifications.types";

/** Generic event handler signature used by `MiniAppSdk.on()`. */
export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

/**
 * The events this SDK knows about, keyed by their full wire name. A
 * compile-time convenience for `sdk.on()` / `sdk.emit()` — not a runtime
 * filter: the `string` overloads remain, so host-defined events outside this
 * map keep working unchanged. Mirrors `APPEARANCE_EVENTS`,
 * `NAVIGATION_EVENTS`, and `CONNECTION_EVENTS`.
 */
export interface SdkEventMap {
  /** Payload is the raw host value: a locale tag or a full `LocaleState`. */
  "appearance.locale.changed": string | LocaleState;
  /** Payload is the raw host value: a preference string or a full `ThemeState`. */
  "appearance.theme.changed": string | ThemeState;
  /** The host is holding a native back press, waiting for the mini app to answer via `navigation.router.back(…)`. */
  "navigation.back.requested": undefined;
  /** Mini app → host: how its internal router moved, so the host can keep its back-button policy in sync. */
  "navigation.route.changed": {
    previous: string;
    current: string;
    canGoBack: boolean;
  };
  /** Emitted when the heartbeat/reconnect detects the host went away. */
  "connection.lost": { timestamp: number };
  /** Emitted after a successful reconnect handshake. */
  "connection.established": { timestamp: number };
  /** Host → mini app: upload progress for an in-flight `http.post`/`put`/`patch`. */
  "http.uploadProgress": HttpProgress;
  /** Host → mini app: the device push token was delivered or refreshed. */
  "notifications.token": string;
  /** Host → mini app: the user tapped a push notification the host resolved into the mini app. */
  "notifications.opened": NotificationOpenEvent;
  /** Host → mini app: a deep link was resolved into this mini app. */
  "links.opened": LinksOpenedEvent;
}

/** Options for `MiniAppSdk.on()` / `RpcClient.onEvent()`. */
export interface OnEventOptions {
  /**
   * When true, the new handler is immediately invoked with the last few
   * payloads this SDK has already seen for that event (a small bounded
   * buffer, kept per event name). Handy for slow mounts that would otherwise
   * miss events pushed before they subscribed. Defaults to false.
   */
  replay?: boolean;
}

/** The host shell the SDK is running inside: Flutter (mobile WebView) or web (Next.js). */
export type PlatformTypeLiteral = "flutter" | "web";

/** Alias kept for hosts/consumers that spell the platform union as `PlatformTypes`. */
export type PlatformTypes = "flutter" | "web";

/**
 * The appearance hint a host attaches to its `platform.getType` reply, so a
 * mini app knows which theme/locale to start in without a second round trip.
 *
 * Each field accepts two forms, and hosts pick whichever they can produce:
 *  - a loose string (`'dark'`, `'en-LK'`) — for the Flutter shell, which has
 *    no `appearance` namespace and only knows the raw values;
 *  - the full `ThemeState`/`LocaleState` — for the web shell, whose
 *    `ShellAppearanceService` already computes `direction`/`mode` properly.
 *
 * The SDK normalizes both into full `ThemeState`/`LocaleState` before they
 * reach `sdk.appearance`, so mini-app code never sees the difference. Prefer
 * the object form when the host has it: re-deriving `direction` from a
 * language subtag is a guess, whereas the host's answer is authoritative.
 */
export type AppearanceType = {
  /** `'light' | 'dark' | 'system'`, or a full `ThemeState`. */
  theme?: string | ThemeState;
  /** BCP-47 tag (`en`, `en-LK`, `ar`), or a full `LocaleState`. */
  locale?: string | LocaleState;
};

/**
 * The reply shape of `platform.getType`.
 *
 * Hosts may answer in either of two forms and both are accepted:
 *  - the legacy bare string — `"flutter"` / `"web"`;
 *  - this object, which additionally carries the appearance hint.
 *
 * `type` and `types` are both honored so a host isn't broken by the spelling
 * it happened to ship with.
 */
export type PlatformTypeResponse = {
  type?: PlatformTypes;
  types?: PlatformTypes;
  appearance?: AppearanceType;
};
