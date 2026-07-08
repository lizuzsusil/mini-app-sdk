# Code Changes Reference — Old vs New

File-by-file comparison of every change recommended in `SDK_REVIEW.md`, with exact line numbers.

---

## 1. `src/errors.ts` — Error Consistency + Static Factory

**Purpose**: Unify all errors under `SdkError` with proper codes. Add a static factory for internal use.

| Line | Old Code | New Code |
|------|----------|----------|
| 1–14 | ```ts import type { PlatformError } from './types'; export class SdkError extends Error { code: string; retryable: boolean; details?: Record<string, unknown>; constructor(error: PlatformError) { super(error.message); this.name = 'SdkError'; this.code = error.code; this.retryable = error.retryable ?? false; this.details = error.details; } } ``` | ```ts import type { PlatformError } from './types'; export const ErrorCodes = { HANDSHAKE_TIMEOUT: 'HANDSHAKE_TIMEOUT', TRANSPORT_STOPPED: 'TRANSPORT_STOPPED', SDK_NOT_INITIALIZED: 'SDK_NOT_INITIALIZED', REQUEST_TIMEOUT: 'REQUEST_TIMEOUT', REQUEST_FAILED: 'REQUEST_FAILED', NO_WINDOW: 'NO_WINDOW', } as const; export class SdkError extends Error { code: string; retryable: boolean; details?: Record<string, unknown>; constructor(error: PlatformError) { super(error.message); this.name = 'SdkError'; this.code = error.code; this.retryable = error.retryable ?? false; this.details = error.details; } static create(code: string, message: string, retryable = false, details?: Record<string, unknown>): SdkError { return new SdkError({ code, message, retryable, details }); } } ``` |
| 2 | (no exports besides `SdkError`) | Add export: `export { ErrorCodes };` |

---

## 2. `src/transport.ts` — SSR Guards, Error Codes, No Magic Strings

**Purpose**: Guard `window` access, use `PROTOCOL_VERSION` constant, use `SdkError` everywhere, accept `targetOrigin`.

| Line | Old Code | New Code |
|------|----------|----------|
| 1 | `import { PLATFORM_EVENT_NAME } from './constants';` | `import { PLATFORM_EVENT_NAME, PROTOCOL_VERSION } from './constants';` |
| 2 | `import { SdkError } from './errors';` | `import { SdkError, ErrorCodes } from './errors';` |
| 4–5 | (not present) | Add to constructor params or class fields: ```ts private readonly targetOrigin: string; constructor(moduleId: string, options: { timeout?: number; retryAttempts?: number; retryDelayMs?: number; targetOrigin?: string }) { /* ... */ this.targetOrigin = options.targetOrigin ?? '*'; } ``` |
| 20 | `constructor(moduleId: string, options: { timeout?: number; retryAttempts?: number; retryDelayMs?: number }) {` | `constructor(moduleId: string, options: { timeout?: number; retryAttempts?: number; retryDelayMs?: number; targetOrigin?: string }) {` |
| 25 | (after `this.traceId = ...`) | Add: `this.targetOrigin = options.targetOrigin ?? '*';` |
| 28–41 | ```ts start(): void { this.messageListener = (event: MessageEvent) => { if (!isPlatformMessage(event.data)) return; this.handleIncomingMessage(event.data); }; window.addEventListener('message', this.messageListener); this.customEventListener = (event: Event) => { const msg = (event as CustomEvent<PlatformMessage>).detail; if (!isPlatformMessage(msg)) return; this.handleIncomingMessage(msg); }; window.addEventListener(PLATFORM_EVENT_NAME, this.customEventListener); } ``` | ```ts start(): void { if (typeof window === 'undefined') return; this.messageListener = (event: MessageEvent) => { if (!isPlatformMessage(event.data)) return; this.handleIncomingMessage(event.data); }; window.addEventListener('message', this.messageListener); this.customEventListener = (event: Event) => { const msg = (event as CustomEvent<PlatformMessage>).detail; if (!isPlatformMessage(msg)) return; this.handleIncomingMessage(msg); }; window.addEventListener(PLATFORM_EVENT_NAME, this.customEventListener); } ``` |
| 48 | `p.reject(new Error('Transport stopped'));` | `p.reject(SdkError.create(ErrorCodes.TRANSPORT_STOPPED, 'Transport stopped'));` |
| 102 | `reject(new SdkError({ code: 'TIMEOUT', message: ..., retryable: true }));` | `reject(SdkError.create(ErrorCodes.REQUEST_TIMEOUT, ..., true));` |
| 115–117 | ```ts private sendMessage(msg: PlatformMessage): void { window.parent.postMessage(msg, '*'); } ``` | ```ts private sendMessage(msg: PlatformMessage): void { if (typeof window === 'undefined') { throw SdkError.create(ErrorCodes.NO_WINDOW, 'Cannot send message outside browser environment'); } const origin = this.targetOrigin; window.parent.postMessage(msg, origin); } ``` |
| 120–123 | ```ts const msg = createMessage('handshake', 'handshake', '', this.moduleId, 'shell', { moduleId: this.moduleId, sdkVersion: '2.0.0', }); ``` | ```ts const msg = createMessage('handshake', 'handshake', '', this.moduleId, 'shell', { moduleId: this.moduleId, sdkVersion: PROTOCOL_VERSION, }); ``` |
| 128 | `reject(new Error('Handshake timed out'));` | `reject(SdkError.create(ErrorCodes.HANDSHAKE_TIMEOUT, 'Handshake timed out', true));` |

---

## 3. `src/sdk.ts` — SSR Guard, Singleton Cleanup, Deprecation

**Purpose**: Guard `initialize()`, destroy previous singleton, expose legacy v1 wrappers.

| Line | Old Code | New Code |
|------|----------|----------|
| 33–34 | ```ts import { PROTOCOL_VERSION } from './constants'; import { SdkTransport } from './transport'; ``` | ```ts import { PROTOCOL_VERSION } from './constants'; import { SdkTransport } from './transport'; import { SdkError, ErrorCodes } from './errors'; ``` |
| 71–77 | ```ts async initialize(): Promise<void> { if (this.initialized) return; this.transport.start(); await this.transport.handshake(); this.platformType = await this.transport.request<PlatformTypeLiteral>('platform', 'getType'); this.initialized = true; } ``` | ```ts async initialize(): Promise<void> { if (this.initialized) return; if (typeof window === 'undefined') { throw SdkError.create(ErrorCodes.NO_WINDOW, 'MiniAppSdk cannot initialize outside browser environment'); } this.transport.start(); await this.transport.handshake(); this.platformType = await this.transport.request<PlatformTypeLiteral>('platform', 'getType'); this.initialized = true; } ``` |
| 214–218 | ```ts export async function initMiniAppSdk(options: MiniAppSdkOptions): Promise<MiniAppSdk> { globalSdk = new MiniAppSdk(options); await globalSdk.initialize(); return globalSdk; } ``` | ```ts export async function initMiniAppSdk(options: MiniAppSdkOptions): Promise<MiniAppSdk> { if (globalSdk) { globalSdk.destroy(); } globalSdk = new MiniAppSdk(options); await globalSdk.initialize(); return globalSdk; } ``` |
| After 218 (new) | (not present) | Add legacy v1 wrappers for backward compat: ```ts /** @deprecated Use `initMiniAppSdk()` instead. Will be removed in v4.0.0. */ export async function initBridge(options: MiniAppSdkOptions): Promise<MiniAppSdk> { console.warn('[MiniAppSDK] initBridge is deprecated. Use initMiniAppSdk instead.'); return initMiniAppSdk(options); } /** @deprecated Access via `sdk.platform.type` instead. Will be removed in v4.0.0. */ export function getPlatformType(): Promise<PlatformTypeLiteral> { console.warn('[MiniAppSDK] getPlatformType is deprecated. Use sdk.platform.type instead.'); const sdk = getMiniAppSdk(); return sdk.platform.type as unknown as Promise<PlatformTypeLiteral>; } ``` |

---

## 4. `src/types.ts` — New Options + Deprecated Export Types

**Purpose**: Add `targetOrigin` to options. Keep old export type aliases for BC.

| Line | Old Code | New Code |
|------|----------|----------|
| 214–219 | ```ts export interface MiniAppSdkOptions { moduleId: string; timeout?: number; retryAttempts?: number; retryDelayMs?: number; } ``` | ```ts export interface MiniAppSdkOptions { moduleId: string; timeout?: number; retryAttempts?: number; retryDelayMs?: number; targetOrigin?: string; } ``` |
| After 219 (new) | (not present) | Add deprecated type alias: ```ts /** @deprecated Use `MiniAppSdkOptions` instead. Removed in v4.0.0. */ export type SdkConfig = MiniAppSdkOptions; ``` |

---

## 5. `src/index.ts` — Re-export New Items

**Purpose**: Expose `ErrorCodes` and deprecated wrappers.

| Line | Old Code | New Code |
|------|----------|----------|
| 1 | `export { SdkError } from './errors';` | `export { SdkError, ErrorCodes } from './errors';` |
| 2 | `export { MiniAppSdk, createMiniAppSdk, getMiniAppSdk, initMiniAppSdk } from './sdk';` | `export { MiniAppSdk, createMiniAppSdk, getMiniAppSdk, initMiniAppSdk, initBridge, getPlatformType } from './sdk';` |
| 3 | `export { SdkTransport } from './transport';` | `export { SdkTransport } from './transport';` (unchanged, but transport now has `targetOrigin` effect) |

---

## 6. `src/cdn.ts` — Already Has Guards, But Add Deprecation

**Purpose**: The CDN entry is well-guarded. Optionally add deprecation warnings for any renamed methods.

| Line | Old Code | New Code |
|------|----------|----------|
| 55–56 | ```ts if (typeof window !== 'undefined') { (window as any).getMiniAppBridge = () => registry; } ``` | (unchanged — already correct) |

---

## 7. `src/constants.ts` — Already Clean, No Change Needed

No code change required. But if you want to export error code strings from here instead of `errors.ts`, that's a style choice.

---

## 8. `package.json` — Add Test Script + Vitest

**Purpose**: Add testing infrastructure.

| Line | Old Code | New Code |
|------|----------|----------|
| 28–36 | ```ts "scripts": { "build": "pnpm run build:lib && pnpm run build:cdn", "build:lib": "tsup src/index.ts --format cjs,esm --dts --clean", "build:cdn": "esbuild src/cdn.ts --bundle --format=iife --platform=browser --target=es2020 --minify --outfile=dist/mini-app-sdk.min.js", "build:registry": "esbuild src/cdn.ts ...", "dev": "tsup src/index.ts --format cjs,esm --dts --watch", "prepublishOnly": "pnpm run build", "clean": "rm -rf dist" } ``` | ```ts "scripts": { "build": "pnpm run build:lib && pnpm run build:cdn", "build:lib": "tsup src/index.ts --format cjs,esm --dts --clean", "build:cdn": "esbuild src/cdn.ts --bundle --format=iife --platform=browser --target=es2020 --minify --outfile=dist/mini-app-sdk.min.js", "build:registry": "esbuild src/cdn.ts ...", "dev": "tsup src/index.ts --format cjs,esm --dts --watch", "prepublishOnly": "pnpm run build", "clean": "rm -rf dist", "test": "vitest run", "test:watch": "vitest" } ``` |
| 37–42 | ```ts "devDependencies": { "@changesets/cli": "^2.31.0", "esbuild": "^0.27.7", "tsup": "^8.5.1", "typescript": "^6.0.3" } ``` | ```ts "devDependencies": { "@changesets/cli": "^2.31.0", "esbuild": "^0.27.7", "tsup": "^8.5.1", "typescript": "^6.0.3", "vitest": "^3.0.0" } ``` |

---

## 9. New File: `vitest.config.ts` — Test Configuration

Create at root:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

---

## 10. New File: `src/transport.test.ts` — Transport Tests

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SdkTransport } from './transport';

describe('SdkTransport', () => {
  let transport: SdkTransport;

  beforeEach(() => {
    transport = new SdkTransport('test-module', {});
  });

  afterEach(() => {
    transport.stop();
  });

  it('start() should not crash outside browser', () => {
    // Simulate SSR — no window
    const origWindow = globalThis.window;
    // @ts-expect-error
    delete (globalThis as any).window;
    expect(() => transport.start()).not.toThrow();
    (globalThis as any).window = origWindow;
  });

  it('stop() should reject pending requests', async () => {
    transport.start();
    // ... test pending rejection
  });

  it('should use provided targetOrigin in sendMessage', () => {
    // ... test origin
  });
});
```

---

## 11. New File: `src/errors.test.ts` — Error Tests

```ts
import { describe, it, expect } from 'vitest';
import { SdkError, ErrorCodes } from './errors';

describe('SdkError', () => {
  it('static create should produce correct SdkError', () => {
    const err = SdkError.create(ErrorCodes.HANDSHAKE_TIMEOUT, 'timed out', true);
    expect(err).toBeInstanceOf(SdkError);
    expect(err.code).toBe('HANDSHAKE_TIMEOUT');
    expect(err.retryable).toBe(true);
    expect(err.message).toBe('timed out');
  });
});
```

---

## Summary of All Affected Files

| File | Nature of Change |
|------|-----------------|
| `src/errors.ts` | Add `ErrorCodes` constant + `SdkError.create()` static method |
| `src/transport.ts` | SSR guard (`typeof window`), `targetOrigin` option, `PROTOCOL_VERSION` constant, proper `SdkError` everywhere |
| `src/sdk.ts` | SSR guard in `initialize()`, destroy previous singleton in `initMiniAppSdk()`, deprecated v1 wrappers |
| `src/types.ts` | Add `targetOrigin` to `MiniAppSdkOptions`, add deprecated type alias |
| `src/index.ts` | Re-export `ErrorCodes` + deprecated wrappers |
| `package.json` | Add test script + `vitest` dev dep |
| `vitest.config.ts` | **New file** — test runner config |
| `src/transport.test.ts` | **New file** — transport unit tests |
| `src/errors.test.ts` | **New file** — error unit tests |
