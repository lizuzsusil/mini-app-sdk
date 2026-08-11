import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  AppearanceSdkModule,
  AppearanceState,
  Direction,
  LocaleState,
  ThemeMode,
  ThemePreference,
  ThemeState,
} from "../types";
import type { AppearanceType } from "../types/common.types";

const DEFAULT_STATE: AppearanceState = {
  locale: { locale: "en", language: "en", direction: "ltr" },
  theme: { preference: "system", mode: "light" },
};

/** Language subtags written right-to-left, used to derive `direction` from a bare locale string. */
const RTL_LANGUAGES = new Set([
  "ar",
  "he",
  "fa",
  "ur",
  "ps",
  "sd",
  "ug",
  "yi",
  "dv",
  "ku",
  "nqo",
]);

/**
 * Resolves `system` into a concrete mode. The Flutter shell sends only a
 * preference, so `system` has to be resolved on this side; `matchMedia` is
 * absent in the WebView tests and in SSR, hence the fallback.
 */
function resolveSystemMode(fallback: ThemeMode): ThemeMode {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Expands a locale tag (`en`, `en-LK`, `ar_SA`) into a full `LocaleState`. */
function localeFromTag(tag: string): LocaleState | null {
  const normalized = tag.trim().replace(/_/g, "-");
  if (!normalized) return null;

  const [languageRaw = "", regionRaw] = normalized.split("-");
  const language = languageRaw.toLowerCase();
  if (!language) return null;

  const region = regionRaw ? regionRaw.toUpperCase() : undefined;
  const locale: LocaleState = {
    locale: region ? `${language}-${region}` : language,
    language,
    direction: RTL_LANGUAGES.has(language) ? "rtl" : "ltr",
  };
  if (region) locale.region = region;
  return locale;
}

/**
 * Coerces whatever a host sent for "locale" into a full `LocaleState`.
 *
 * Accepts the bare tag the Flutter shell sends (`"en-LK"`), the structured
 * state the web shell's `appearance` namespace returns, and the
 * `{ locale: … }` wrapper an event payload may arrive in. Returns `null` for
 * anything unusable so the caller can leave the store untouched rather than
 * overwrite good state with garbage.
 *
 * Fields the host supplied always win: `direction` is only derived from the
 * language subtag when the host didn't say.
 */
export function normalizeLocale(input: unknown): LocaleState | null {
  if (typeof input === "string") return localeFromTag(input);
  if (!input || typeof input !== "object") return null;

  const candidate = input as Partial<LocaleState> & { locale?: unknown };

  // `LocaleState.locale` is a string; an object there means a `{ locale: … }`
  // wrapper, so unwrap one level and re-enter.
  if (candidate.locale && typeof candidate.locale === "object") {
    return normalizeLocale(candidate.locale);
  }

  const tag =
    typeof candidate.locale === "string" && candidate.locale
      ? candidate.locale
      : candidate.language;
  if (typeof tag !== "string") return null;

  const derived = localeFromTag(tag);
  if (!derived) return null;

  const language = candidate.language ?? derived.language;
  const region = candidate.region ?? derived.region;
  const direction: Direction =
    candidate.direction === "rtl" || candidate.direction === "ltr"
      ? candidate.direction
      : derived.direction;

  const locale: LocaleState = { locale: derived.locale, language, direction };
  if (region) locale.region = region;
  return locale;
}

/**
 * Coerces whatever a host sent for "theme" into a full `ThemeState`.
 *
 * Accepts the bare preference the Flutter shell sends (`"dark"`), the
 * `{ preference, mode }` state the web shell returns, and the
 * `{ theme: … }` wrapper an event payload may arrive in. `system` is
 * resolved to a concrete mode when the host didn't already resolve it.
 * Returns `null` for anything unusable.
 */
export function normalizeTheme(
  input: unknown,
  fallbackMode: ThemeMode = "light",
): ThemeState | null {
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (value !== "dark" && value !== "light" && value !== "system")
      return null;
    const preference = value as ThemePreference;
    return {
      preference,
      mode:
        preference === "system" ? resolveSystemMode(fallbackMode) : preference,
    };
  }

  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ThemeState> & { theme?: unknown };

  // A `{ theme: … }` wrapper — `ThemeState` itself has no `theme` field.
  if (candidate.theme !== undefined && candidate.preference === undefined) {
    return normalizeTheme(candidate.theme, fallbackMode);
  }

  const base = normalizeTheme(candidate.preference, fallbackMode);
  if (!base) return null;

  // A host-resolved mode is authoritative — only fall back to our own
  // resolution when it didn't send one.
  const mode: ThemeMode =
    candidate.mode === "dark" || candidate.mode === "light"
      ? candidate.mode
      : base.mode;
  return { preference: base.preference, mode };
}

/** Event names published by the host (mirror of host `PLATFORM_EVENTS`). */
export const APPEARANCE_EVENTS = {
  LOCALE_CHANGED: "appearance.locale.changed",
  THEME_CHANGED: "appearance.theme.changed",
} as const;

/**
 * Internal handle returned alongside the public `AppearanceSdkModule` so the
 * composition root (`MiniAppSdk`) can push host-published `appearance.*`
 * events into the store.
 */
export interface AppearanceModuleHandle {
  module: AppearanceSdkModule;
  setLocale(locale: LocaleState): void;
  setTheme(theme: ThemeState): void;
  /**
   * Seeds the store from the loose `{ theme, locale }` hint a host attaches
   * to its `platform.getType` reply. This is how the Flutter shell — which
   * doesn't implement the `appearance` namespace — gets its theme and locale
   * into `sdk.appearance`, so mini-app code reads the same surface on both
   * shells.
   */
  applyHint(hint: AppearanceType): void;
}

/**
 * Host-driven locale & theme module. Reads the active locale/theme from the
 * host and keeps a tiny observable store that subscribers (framework hooks)
 * consume. The host is the single source of truth: on `appearance.locale.changed`
 * / `appearance.theme.changed` the SDK updates the store and listeners re-render.
 */
export function createAppearanceModule(rpc: RpcClient): AppearanceModuleHandle {
  let state: AppearanceState = { ...DEFAULT_STATE };
  const listeners = new Set<(next: AppearanceState) => void>();

  const notify = (): void => {
    const snapshot: AppearanceState = {
      locale: { ...state.locale },
      theme: { ...state.theme },
    };
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        // A subscriber must not break the notification loop.
        // eslint-disable-next-line no-console
        console.error("[appearance] listener error:", error);
      }
    }
  };

  const setLocale = (locale: LocaleState): void => {
    const prev = state.locale;
    if (locale.locale === prev.locale && locale.direction === prev.direction)
      return;
    state = { ...state, locale: { ...locale } };
    notify();
  };

  const setTheme = (theme: ThemeState): void => {
    const prev = state.theme;
    if (theme.preference === prev.preference && theme.mode === prev.mode)
      return;
    state = { ...state, theme: { ...theme } };
    notify();
  };

  const applyHint = (hint: AppearanceType): void => {
    if (!hint) return;
    if (hint.locale !== undefined) {
      const locale = normalizeLocale(hint.locale);
      if (locale) setLocale(locale);
    }
    if (hint.theme !== undefined) {
      const theme = normalizeTheme(hint.theme, state.theme.mode);
      if (theme) setTheme(theme);
    }
  };

  const module: AppearanceSdkModule = {
    async getLocale(): Promise<LocaleState> {
      // Hosts that deliver appearance via the `platform.getType` hint (the
      // Flutter shell) don't implement this namespace, so an explicit call
      // would reject. Serving the store keeps the module's surface identical
      // on every shell.
      if (!rpc.getCapabilities().includes(NAMESPACES.APPEARANCE)) {
        return { ...state.locale };
      }
      const raw = await rpc.request<LocaleState>(
        NAMESPACES.APPEARANCE,
        ACTIONS.APPEARANCE.GET_LOCALE,
      );
      const locale = normalizeLocale(raw) ?? raw;
      setLocale(locale);
      return { ...locale };
    },

    async getTheme(): Promise<ThemeState> {
      if (!rpc.getCapabilities().includes(NAMESPACES.APPEARANCE)) {
        return { ...state.theme };
      }
      const raw = await rpc.request<ThemeState>(
        NAMESPACES.APPEARANCE,
        ACTIONS.APPEARANCE.GET_THEME,
      );
      const theme = normalizeTheme(raw, state.theme.mode) ?? raw;
      setTheme(theme);
      return { ...theme };
    },

    state(): AppearanceState {
      return {
        locale: { ...state.locale },
        theme: { ...state.theme },
      };
    },

    subscribe(listener: (next: AppearanceState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return { module, setLocale, setTheme, applyHint };
}
