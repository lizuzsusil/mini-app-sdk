import { describe, expect, it, vi } from 'vitest';
import { createAppearanceModule, normalizeLocale, normalizeTheme } from './appearance.module';
import type { RpcClient } from '../rpc';

function makeModule(
  overrides?: Partial<Record<'locale' | 'theme', unknown>>,
  capabilities: string[] = ['appearance'],
) {
  const rpc = {
    request: vi.fn(async (_ns: string, action: string) => {
      if (action === 'getLocale') return overrides?.locale ?? { locale: 'si-LK', language: 'si', direction: 'ltr' };
      if (action === 'getTheme') return overrides?.theme ?? { preference: 'light', mode: 'light' };
      return undefined;
    }),
    getCapabilities: () => capabilities,
  } as unknown as RpcClient;
  return { rpc, handle: createAppearanceModule(rpc) };
}

describe('appearance module', () => {
  it('reads the host locale via RPC and exposes it', async () => {
    const { handle } = makeModule();
    const locale = await handle.module.getLocale();
    expect(locale.locale).toBe('si-LK');
    expect(handle.module.state().locale.language).toBe('si');
  });

  it('reads the host theme via RPC and exposes it', async () => {
    const { handle } = makeModule();
    const theme = await handle.module.getTheme();
    expect(theme.mode).toBe('light');
    expect(handle.module.state().theme.preference).toBe('light');
  });

  it('notifies subscribers when the host pushes a locale change', () => {
    const { handle } = makeModule();
    const listener = vi.fn();
    handle.module.subscribe(listener);
    handle.setLocale({ locale: 'ta-LK', language: 'ta', direction: 'ltr' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].locale.language).toBe('ta');
  });

  it('notifies subscribers when the host pushes a theme change', () => {
    const { handle } = makeModule();
    const listener = vi.fn();
    handle.module.subscribe(listener);
    handle.setTheme({ preference: 'dark', mode: 'dark' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].theme.mode).toBe('dark');
  });

  it('seeds the store from a loose string hint (the Flutter shell)', () => {
    const { handle } = makeModule(undefined, []);
    handle.applyHint({ locale: 'en-LK', theme: 'dark' });

    const state = handle.module.state();
    expect(state.locale).toEqual({ locale: 'en-LK', language: 'en', region: 'LK', direction: 'ltr' });
    expect(state.theme).toEqual({ preference: 'dark', mode: 'dark' });
  });

  it('seeds the store from a structured hint (the web shell) without re-deriving', () => {
    const { handle } = makeModule(undefined, []);
    // Host says `rtl` for a language our RTL table would call `ltr` — the
    // host is authoritative and must win.
    handle.applyHint({
      locale: { locale: 'xx-YY', language: 'xx', region: 'YY', direction: 'rtl' },
      theme: { preference: 'system', mode: 'dark' },
    });

    expect(handle.module.state().locale.direction).toBe('rtl');
    expect(handle.module.state().theme).toEqual({ preference: 'system', mode: 'dark' });
  });

  it('serves the store instead of an RPC when the host lacks the appearance namespace', async () => {
    const { rpc, handle } = makeModule(undefined, []);
    handle.applyHint({ locale: 'ar', theme: 'dark' });

    await expect(handle.module.getLocale()).resolves.toEqual({
      locale: 'ar',
      language: 'ar',
      direction: 'rtl',
    });
    await expect(handle.module.getTheme()).resolves.toEqual({ preference: 'dark', mode: 'dark' });
    expect(rpc.request).not.toHaveBeenCalled();
  });

  it('ignores unusable hint values rather than clobbering good state', () => {
    const { handle } = makeModule(undefined, []);
    handle.applyHint({ locale: 'en-LK', theme: 'dark' });
    const before = handle.module.state();

    handle.applyHint({ locale: '', theme: 'chartreuse' });
    expect(handle.module.state()).toEqual(before);
  });

  it('deduplicates identical pushes and supports unsubscribe', () => {
    const { handle } = makeModule();
    const listener = vi.fn();
    const unsub = handle.module.subscribe(listener);
    handle.setLocale({ locale: 'en-LK', language: 'en', direction: 'ltr' });
    handle.setLocale({ locale: 'en-LK', language: 'en', direction: 'ltr' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    handle.setTheme({ preference: 'dark', mode: 'dark' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('appearance normalizers', () => {
  it('expands locale tags, deriving direction and region', () => {
    expect(normalizeLocale('en')).toEqual({ locale: 'en', language: 'en', direction: 'ltr' });
    expect(normalizeLocale('ar-SA')).toEqual({
      locale: 'ar-SA',
      language: 'ar',
      region: 'SA',
      direction: 'rtl',
    });
    // Underscore separators and odd casing are common from mobile hosts.
    expect(normalizeLocale('EN_lk')).toEqual({
      locale: 'en-LK',
      language: 'en',
      region: 'LK',
      direction: 'ltr',
    });
  });

  it('unwraps event-payload wrappers', () => {
    expect(normalizeLocale({ locale: { locale: 'si-LK', language: 'si', direction: 'ltr' } }))
      .toEqual({ locale: 'si-LK', language: 'si', region: 'LK', direction: 'ltr' });
    expect(normalizeTheme({ theme: 'dark' })).toEqual({ preference: 'dark', mode: 'dark' });
  });

  it('resolves `system` against the supplied fallback mode', () => {
    expect(normalizeTheme('system', 'dark')).toEqual({ preference: 'system', mode: 'dark' });
    expect(normalizeTheme({ preference: 'system', mode: 'light' }, 'dark'))
      .toEqual({ preference: 'system', mode: 'light' });
  });

  it('returns null for unusable input', () => {
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale({})).toBeNull();
    expect(normalizeTheme('neon')).toBeNull();
    expect(normalizeTheme(undefined)).toBeNull();
  });
});
