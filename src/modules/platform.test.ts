import { describe, expect, it } from 'vitest';
import { createPlatformModule } from './platform.module';

describe('platform module', () => {
  it('accepts the legacy bare-string reply (the web shell today)', () => {
    const handle = createPlatformModule('web');
    const resolved = handle.applyResponse('flutter');

    expect(resolved).toEqual({ type: 'flutter', appearance: null });
    expect(handle.module.type).toBe('flutter');
    expect(handle.module.isFlutter()).toBe(true);
    expect(handle.module.isMobile()).toBe(true);
  });

  it('accepts the object reply and hands back the appearance hint', () => {
    const handle = createPlatformModule('web');
    const resolved = handle.applyResponse({
      types: 'flutter',
      appearance: { locale: 'en-LK', theme: 'dark' },
    });

    expect(resolved.type).toBe('flutter');
    expect(resolved.appearance).toEqual({ locale: 'en-LK', theme: 'dark' });
    expect(handle.module.isWeb()).toBe(false);
  });

  it('honors `type` as well as `types`', () => {
    const handle = createPlatformModule('web');
    expect(handle.applyResponse({ type: 'flutter' }).type).toBe('flutter');
  });

  it('keeps the current type when the reply is malformed', () => {
    const handle = createPlatformModule('web');
    handle.setType('flutter');

    for (const bad of [null, undefined, 42, 'Flutter', { types: 'android' }]) {
      expect(handle.applyResponse(bad).type).toBe('flutter');
    }
    expect(handle.module.type).toBe('flutter');
  });

  it('reports no hint when the appearance object carries nothing usable', () => {
    const handle = createPlatformModule('web');
    expect(handle.applyResponse({ types: 'web', appearance: {} }).appearance).toBeNull();
    expect(handle.applyResponse({ types: 'web' }).appearance).toBeNull();
  });
});
