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

//left to right languages list
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

// preference resolve based on platform
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

export function normalizeLocale(input: unknown): LocaleState | null {
  if (typeof input === "string") return localeFromTag(input);
  if (!input || typeof input !== "object") return null;

  const candidate = input as Partial<LocaleState> & { locale?: unknown };

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

  if (candidate.theme !== undefined && candidate.preference === undefined) {
    return normalizeTheme(candidate.theme, fallbackMode);
  }

  const base = normalizeTheme(candidate.preference, fallbackMode);
  if (!base) return null;

  const mode: ThemeMode =
    candidate.mode === "dark" || candidate.mode === "light"
      ? candidate.mode
      : base.mode;
  return { preference: base.preference, mode };
}

export const APPEARANCE_EVENTS = {
  LOCALE_CHANGED: "appearance.locale.changed",
  THEME_CHANGED: "appearance.theme.changed",
} as const;

export interface AppearanceModuleHandle {
  module: AppearanceSdkModule;
  setLocale(locale: LocaleState): void;
  setTheme(theme: ThemeState): void;
  applyHint(hint: AppearanceType): void;
}

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
