import type { LocaleState, ThemeState } from "@lizuz/mini-app-types";

/** Generic event handler signature used by `MiniAppSdk.on()`. */
export type EventHandler<TPayload = unknown> = (payload: TPayload) => void;

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
