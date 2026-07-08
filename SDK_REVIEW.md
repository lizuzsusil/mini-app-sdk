# SDK Codebase Review

Based on analysis of the current codebase against SDK best practices for a framework-agnostic, unified web + mobile (Flutter) SDK with backward compatibility.

---

## 1. Versioning & Backward Compatibility

### Current State
- Package jumped from `1.0.0` → `2.0.0` with **no deprecation cycle**. Old APIs (Flutter bridge, `TransportMode`) were removed outright.
- No `@deprecated` JSDoc tags anywhere in the codebase.
- No deprecation warning logs emitted for removed/replaced exports.
- `@changesets/cli` is installed but not configured for changelog generation.

### Recommendations
- **Adopt a deprecation policy**: APIs marked `@deprecated` in v2.x survive through v3.x and are removed in v4.x. Emit runtime warnings:
  ```ts
  /** @deprecated Use `newMethod` instead. Will be removed in v4.0.0. */
  export function oldMethod() {
    console.warn('[MiniAppSDK] oldMethod is deprecated. Use newMethod instead.');
    return newMethod();
  }
  ```
- **Restore removed v1 exports as deprecated wrappers** in v2.x so consumers get a migration path instead of breakage on upgrade.
- **Use `PROTOCOL_VERSION` constant consistently** — `transport.ts:122` hardcodes `'2.0.0'` as a string literal instead of importing the constant.
- **Wire up `@changesets/cli`** for automated changelog generation per PR.

---

## 2. Error Handling Consistency

### Current State
- `src/errors.ts` — `SdkError` requires a `PlatformError` object; always has `code`, `retryable`, `details`.
- `transport.ts:128` — Handshake timeout throws `new Error('Handshake timed out')` (plain `Error`, no code).
- `transport.ts:48` — Transport stop rejects with `new Error('Transport stopped')` (plain `Error`).
- `sdk.ts:209` — `getMiniAppSdk()` throws `new Error(...)` (plain `Error`).
- Callers cannot distinguish SDK errors from host errors without string-matching.

### Recommendations
- **Every thrown/rejected `Error` should be an `SdkError`** with a proper `code`:
  - `HANDSHAKE_TIMEOUT` — retryable
  - `TRANSPORT_STOPPED` — not retryable
  - `SDK_NOT_INITIALIZED` — not retryable
  - `REQUEST_TIMEOUT` — retryable (already done)
- **Add a static helper** so internal errors don't need a `PlatformError` object:
  ```ts
  export class SdkError extends Error {
    static create(code: string, message: string, retryable = false, details?: Record<string, unknown>) {
      return new SdkError({ code, message, retryable, details });
    }
    // ...
  }
  ```

---

## 3. SSR & Non-Browser Safety

### Current State
- `transport.ts:33,40` — `window.addEventListener` called unconditionally in `start()`.
- `transport.ts:116` — `window.parent.postMessage` called unconditionally.
- `cdn.ts:54` — correctly guards with `typeof window !== 'undefined'`. The main SDK does not.
- The SDK is intended for browser/WebView only, but these locations will crash in Node.js SSR.

### Recommendations
- **Guard every `window` access** in the main SDK, not just the CDN entry:
  ```ts
  start(): void {
    if (typeof window === 'undefined') return;
    // ...
  }
  ```
- `sendMessage` should throw an `SdkError` with code `NO_WINDOW` instead of crashing.
- `initialize()` can check `typeof window` early and reject cleanly.

---

## 4. Multiple Instance Safety

### Current State
- `sdk.ts:201` — Single module-level `globalSdk` variable.
- `initMiniAppSdk()` (`sdk.ts:214`) overwrites `globalSdk` without calling `destroy()` on the previous instance.
- The CDN entry (`cdn.ts`) builds a proper multi-instance registry with `Map<string, MiniAppSdk>`, but the library entry only supports one.

### Recommendations
- **Track previous instance** in `initMiniAppSdk()` and destroy it before replacing:
  ```ts
  export async function initMiniAppSdk(options: MiniAppSdkOptions): Promise<MiniAppSdk> {
    globalSdk?.destroy();
    globalSdk = new MiniAppSdk(options);
    await globalSdk.initialize();
    return globalSdk;
  }
  ```
- Or, better: require consumers to manage instances explicitly (they already can via `createMiniAppSdk()` + manual `initialize()`).
- Keep the singleton helpers but document they are convenience wrappers, not the primary API.

---

## 5. Memory Management

### Current State
- `SdkTransport.start()` registers `message` and custom event listeners on `window` that are only removed via `stop()`.
- `pending` Map retains references to unresolved promises indefinitely (until timeout or response).
- If a consumer creates an SDK instance but never calls `destroy()`, listeners leak.

### Recommendations
- **Add a destructor safety net**: Track active instances and warn on unload if any remain undestroyed.
- **Use `AbortController` / `AbortSignal`** for request cancellation instead of manual timer management.
- **WeakRef patterns** could help if the SDK is used in hot-reload / dev-mode scenarios.

---

## 6. Testing & CI

### Current State
- **Zero tests.** No test framework in `devDependencies`. No test script in `package.json`.
- CI only builds and commits dist — no test step.

### Recommendations
- Add `vitest` (zero-config, fast, TS-native).
- Test at minimum:
  - **Unit**: `SdkError` construction, `createMessage`, `generateId`, `isPlatformMessage`, `delay`.
  - **Integration**: Transport lifecycle (start → handshake → request → response → stop) with a mock `window`.
  - **Platform**: SSR guard behavior, multiple `initMiniAppSdk` calls, destroy cleanup.
- Run tests in CI before the build step.

---

## 7. Bundle & Dependency Hygiene

### Current State
- **Zero runtime deps** — excellent.
- `"sideEffects": false` — correct for tree-shaking.
- Two build tools (tsup + esbuild) — slightly redundant.

### Recommendations
- **Maintain zero-dependency policy** — it's your biggest advantage for Flutter interop.
- Consider unifying on a single build tool (tsup can handle both ESM/CJS and IIFE).
- Set a bundle size budget (e.g., CI fails if `dist/mini-app-sdk.min.js` > 15KB gzipped).

---

## 8. Documentation (TSDoc)

### Current State
- Only one JSDoc comment exists in the entire source (`cdn.ts:25-28`).
- Public exports in `index.ts`, `sdk.ts`, `transport.ts`, `errors.ts`, `utils.ts`, `types.ts` are completely undocumented.
- `README.md`, `overview.md`, and `Messaging_Architecture.md` exist but are external docs — not in-code docs.

### Recommendations
- **Add TSDoc to every public export**: `MiniAppSdk`, `SdkError`, `SdkTransport`, all factory functions, all utility functions.
- Document what each module does, expected payloads, error codes it can throw.
- Generate a reference doc site from the TSDoc.

---

## 9. Security

### Current State
- `transport.ts:116` — `postMessage` uses `'*'` as target origin.
- No message signing or origin validation in the SDK (delegated to host).
- No `AbortSignal` support — requests can't be cancelled externally.

### Recommendations
- Accept an optional `targetOrigin` in `MiniAppSdkOptions` instead of hardcoding `'*'`:
  ```ts
  sendMessage(msg: PlatformMessage): void {
    const origin = this.targetOrigin ?? '*';
    window.parent.postMessage(msg, origin);
  }
  ```
- Document that `targetOrigin` should be set to the host's origin in production.
- Consider `AbortSignal` integration for request cancellation.

---

## 10. Architectural Notes

### What the SDK does well (keep doing these)
- **Zero runtime dependencies** — ideal for Flutter and web unification.
- **Platform-agnostic transport** — single `postMessage` protocol with no platform branches in v2.
- **Clean module isolation** — `auth`, `config`, `device`, etc. are separated by namespace naturally.
- **Fire-and-forget telemetry** — errors in telemetry don't crash the host app.
- **Retry with backoff** — solid pattern for transient host failures.

### What needs attention
- `SdkTransport` is tightly coupled to `window` — consider an adapter interface for non-browser targets.
- `platform.type` requires a round-trip handshake before it's known — consumers calling `isMobile()` before initialization get incorrect results.
- Magic strings (`'shell'`, `'TIMEOUT'`, `'2.0.0'`) scattered in transport logic.
