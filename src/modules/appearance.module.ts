import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type {
  AppearanceState,
  AppearanceSdkModule,
  LocaleState,
  ThemeState,
} from '../types';

const DEFAULT_STATE: AppearanceState = {
  locale: { locale: 'en', language: 'en', direction: 'ltr' },
  theme: { preference: 'system', mode: 'light' },
};

/** Event names published by the host (mirror of host `PLATFORM_EVENTS`). */
export const APPEARANCE_EVENTS = {
  LOCALE_CHANGED: 'appearance.locale.changed',
  THEME_CHANGED: 'appearance.theme.changed',
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
        console.error('[appearance] listener error:', error);
      }
    }
  };

  const setLocale = (locale: LocaleState): void => {
    const prev = state.locale;
    if (locale.locale === prev.locale && locale.direction === prev.direction) return;
    state = { ...state, locale: { ...locale } };
    notify();
  };

  const setTheme = (theme: ThemeState): void => {
    const prev = state.theme;
    if (theme.preference === prev.preference && theme.mode === prev.mode) return;
    state = { ...state, theme: { ...theme } };
    notify();
  };

  const module: AppearanceSdkModule = {
    async getLocale(): Promise<LocaleState> {
      const locale = await rpc.request<LocaleState>(
        NAMESPACES.APPEARANCE,
        ACTIONS.APPEARANCE.GET_LOCALE,
      );
      setLocale(locale);
      return { ...locale };
    },

    async getTheme(): Promise<ThemeState> {
      const theme = await rpc.request<ThemeState>(
        NAMESPACES.APPEARANCE,
        ACTIONS.APPEARANCE.GET_THEME,
      );
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

  return { module, setLocale, setTheme };
}
