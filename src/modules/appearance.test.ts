import { describe, expect, it, vi } from 'vitest';
import { createAppearanceModule } from './appearance.module';
import type { RpcClient } from '../rpc';

function makeModule(overrides?: Partial<Record<'locale' | 'theme', unknown>>) {
  const rpc = {
    request: vi.fn(async (_ns: string, action: string) => {
      if (action === 'getLocale') return overrides?.locale ?? { locale: 'si-LK', language: 'si', direction: 'ltr' };
      if (action === 'getTheme') return overrides?.theme ?? { preference: 'light', mode: 'light' };
      return undefined;
    }),
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
