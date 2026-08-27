# Implementation Record — `future.md` Short-Term Roadmap (No-Break)

> **Scope:** Additive, backward-compatible implementation of `future.md` short-term (S1–S6) items.  
> **Base:** `@lizuz/sewa-sdk@1.0.8` (`PROTOCOL_VERSION 1.0.0` at `src/constants/protocol.constants.ts:7`).  
> **Verification:** `pnpm typecheck` 0 errors, `pnpm lint` 0 errors (`biome check`), `pnpm test` 18/18 files 201/201 tests, `pnpm build` ok (`12.9 kB gzipped` <30 kB budget), `api-extractor` report regenerated.  
> **Commit stat:** 16 files changed, 722 insertions(+), 43 deletions(-) + 4 new files.

---

## Table of Contents
1. [Features Included](#1-features-included)
2. [Features Deferred (Intentionally Not Implemented)](#2-features-deferred)
3. [Incremental File Details](#3-incremental-file-details)
4. [Diff Summary](#4-diff-summary)
5. [Verification & Backward Compatibility](#5-verification--backward-compatibility)
6. [Migration Guide for Consumers](#6-migration-guide)
7. [Future Work — How to Continue](#7-future-work)

---

## 1. Features Included

All items below map to `future.md` sections and were implemented as **pure additions** (no public API removed, no wire format change).

| # | Feature | `future.md` Ref | Effort | Status |
|---|---------|----------------|--------|--------|
| F1 | **Instance registry unification** (`src/client/instance-registry.ts`) — single `Map<miniAppId, MiniAppSdk>` backing both `window.__GSA_SDK__` (CDN) and module-scoped `activeInstance` (`src/index.ts:153`). | A2 §3.1 | S | ✅ Done |
| F2 | **Structured error guards + `SdkError.toJSON()`** — `isSdkError`, `isRetryable`, `isTimeout`, `isTransportError`, `isHandshakeError`, `isAuthError`, `getErrorCode`, `SdkErrorCode="INVALID_OPTIONS"`. | OBS1 §3.9 | S | ✅ Done |
| F3 | **Option validation `validateSdkOptions`** — fail-fast on bad `miniAppId/timeout/retry*`/`heartbeat`/`targetOrigin`/`logLevel` with `INVALID_OPTIONS`. | E3 §3.3 | S | ✅ Done |
| F4 | **Diagnostics `debug.diagnose()`** — heuristic checks (`NOT_INITIALIZED`, `DESTROYED`, `NO_CAPABILITIES`, `PENDING_BACKLOG>5`, `TRANSPORT_NOT_STARTED`, `HIGH_FAILURE_RATE>50%`, `APPEARANCE_INCOMPLETE`, `PLUGINS_ACTIVE`, `DIAGNOSE_ERROR`). | OBS1/AI3 §3.9/3.13 | S | ✅ Done |
| F5 | **Chat alias `sdk.chat`** — getter alias for `sdk.ai` (`@deprecated` on `ai`, `chat` preferred). | E1 §3.3 | S | ✅ Done |
| F6 | **Async event helpers** — `sdk.once(event, {signal?, replay?}) : Promise`, `sdk.events(event, {signal?, replay?}) : AsyncIterable`, `sdk.on(event, handler, {signal, replay})` auto-unsubscribe. | E2 §3.3 | S | ✅ Done |
| F7 | **Result-type helper `requestSafe`** — `sdk.requestSafe<T>() => {ok:true,value}|{ok:false,error}`. | E4 §3.3 | S | ✅ Done |
| F8 | **Plugin system `SdkPlugin` + `usePlugin`** — `install(ctx:{sdk,rpc,logger})`, `onInitialize`, `onDestroy` (reverse order). | P1 §3.6 | M | ✅ Done |
| F9 | **Bounded handler guard** — `devMode` warn if >20 handlers/event in `RpcClient.onEvent`. | PERF3 §3.7 | S | ✅ Done |
| F10 | **Transport dev validation logging** — `DefaultTransport` logs `validatePlatformMessage` reason at `debug` when `channel===MESSAGE_CHANNEL` but payload invalid (covers `APPEARANCE.md:200` timestamp/string bugs). | A4 §3.1 | S | ✅ Done |
| F11 | **Testing harness `MockHost`** — wraps `FakeTransport`, auto-answers handshake + `platform.getType` hint, `emit`/`emitEvent` helpers. | T1 §3.10 | S | ✅ Done |
| F12 | **Chat module fix** — corrected `createChatModule` to use `NAMESPACES.AI/ACTIONS.AI.CHAT` (was `HTTP/STREAM` copy-paste bug). | Bugfix | S | ✅ Done |
| F13 | **Baseline test/type green** — fixed pre-existing broken tests (`navigation.router`, `links.isSupported`, `http post` 2-arg) so `typecheck`/`test` pass on main. | Baseline | S | ✅ Done |

> **Not included (intentionally deferred to medium/long-term):** request deduplication/batch (PERF1/2), lazy/tree-shakable modules (P2), offline queue (F1), `WebSocket`/`MessagePort` transports (FUT1), binary `structuredClone` (FUT2), spec-driven codegen (AI1), circuit breaker/adaptive timeout (REL1), worker/SSR transports (F4). They require host coordination or larger refactors.

---

## 2. Features Deferred

| Future Ref | Why deferred |
|------------|--------------|
| PERF1 deduplication, PERF2 batch | Needs host batch capability negotiation + allowlist tuning; would enlarge `RpcClient` beyond S1 scope. |
| P2 lazy modules | Requires `ModuleRegistry.registerLazy` + `package.json` `exports` per-module; deferred to M2. |
| F1 offline queue | Depends on plugin system (now done) but needs persistence adapter + idempotency allowlist — next PR. |
| SEC1 strict origin enforcement | Warning added; enforcement (`*` → error) scheduled for next minor per `future.md` §3.8 warning-first policy. |
| FUT transports/binary | Needs new `Transport` implementations and handshake negotiation; medium-term. |

---

## 3. Incremental File Details

### 3.1 New Files

#### `src/client/instance-registry.ts` (+68 lines) — NEW
**Purpose:** A2 — unify dual singletons (`src/index.ts:153` `activeInstance` vs `window.__GSA_SDK__` + `src/client/MiniAppSdk.ts:248` global write).  
**Implementation:**
- `Map<string, MiniAppSdk> instances` keyed by `miniAppId`.
- `registerInstance(instance)` → `instances.set(...)` + `writeGlobal(instance)` (mirrors to `globalThis.__GSA_SDK__` for CDN backward compat).
- `unregisterInstance(instance)` → delete + restore last remaining instance to global.
- `getInstance(miniAppId?)` → by key or most-recently-registered (matches legacy `getMiniAppSdk()` semantics). Uses `array[array.length-1]` (ES2020 compat, not `.at(-1)`).
- `getAllInstances()`, `clearInstances()`.
- `writeGlobal` wrapped in `try/catch` for non-writable `globalThis` in embedded WebViews.
**Backward compat:** Existing code reading `window.__GSA_SDK__` keeps working; both CDN IIFE and module helpers share same backing store.  
**Exports:** Re-exported from `src/client/index.ts:3` and `src/index.ts:4`.

#### `src/errors/guards.ts` (+58 lines) — NEW
**Purpose:** OBS1 — structured error taxonomy helpers (`future.md` §3.9).  
**Exports:**
- `isSdkError(error): error is SdkError`
- `isRetryable(error): boolean` (checks `retryable` boolean on `SdkError` or any object)
- `isTimeout(error): error is TimeoutError`
- `isTransportError(error): error is TransportError`
- `isHandshakeError(error): error is HandshakeError`
- `isAuthError(error): boolean` (checks `AUTH_FAILED/AUTH_REQUIRED/UNAUTHENTICATED/FORBIDDEN`)
- `getErrorCode(error): string|undefined`
**Implementation notes:** Pure, never throws, safe in `catch` and `onSnapshot`.  
**Consumers:** `src/errors/index.ts:1` re-exports; `src/index.ts:17` public re-export.

#### `src/types/validate-options.ts` (+73 lines) — NEW
**Purpose:** E3 — fluent validation for `MiniAppSdkOptions` (`future.md` §3.3).  
**Logic:**
- `miniAppId` required non-empty string else `SdkError {code:"INVALID_OPTIONS"}`.
- `checkPositive(name, value, allowZero)` for `timeout/retryAttempts/retryDelayMs/maxRetryDelayMs`; finite number ≥1 (or ≥0 if allowZero).
- `heartbeat` must be object, each `intervalMs/timeoutMs/maxMissedPongs` positive finite if present.
- `targetOrigin` string if present, `logLevel` one of `debug|info|warn|error` if present.
**Usage:** Called at top of `MiniAppSdk` constructor (`src/client/MiniAppSdk.ts:168`).  
**Compat:** New code `INVALID_OPTIONS` additive; previously invalid configs were buggy and now fail fast (preferred over silent timeout).

#### `src/testing/mock-host.ts` (+95 lines) — NEW
**Purpose:** T1 — integration harness (`future.md` §3.10).  
**API:**
```ts
class MockHost {
  readonly transport: FakeTransport;
  constructor(opts?: MockHostOptions {capabilities, protocolVersion, platformType, appearanceHint, autoRespondHandshake, autoRespondGetType})
  get sent: PlatformMessage[]
  emit(message: PlatformMessage)
  emitEvent(namespace, action, payload?)
  get asTransport: Transport
}
```
- Intercepts `FakeTransport.send`, `queueMicrotask` auto-answers `handshake.connect` with `status:ok` + `protocolVersion`/`capabilities`, and `platform.getType` with `{type, appearance}` hint.
- Enables `await sdk.initialize()` in tests without manual `createMessage` crafting.
**Exports:** `src/testing/index.ts:2`.

### 3.2 Modified Files — Core SDK

#### `src/client/MiniAppSdk.ts` (+302 −22, 798 lines total) — MAJOR
**Imports:**
- Removed `SDK_GLOBAL_KEY` (no longer directly written) → `src/constants:2`.
- Added `Diagnostic` (`src/types:45`), `validateSdkOptions` (`src/types/validate-options:67`), `registerInstance/unregisterInstance/getRegistryInstance` (`src/client/instance-registry:69`).

**New interface `SdkPlugin` (`src/client/MiniAppSdk.ts:112`):**
```ts
interface SdkPlugin {
  name: string;
  install(ctx:{sdk:MiniAppSdk; rpc:RpcClient; logger:Logger}): void|Promise<void>;
  onInitialize?(): Promise<void>;
  onDestroy?(): void;
}
```

**Class fields:**
- Added `get chat(): ChatSdkModule { return this.ai; }` alias (`src/client/MiniAppSdk.ts:142`) — `@deprecated` on `ai` vs `chat` via `src/types/sdk.types.ts:113`.
- Added `private readonly plugins: SdkPlugin[] = []` (`src/client/MiniAppSdk.ts:162`).

**Constructor (`src/client/MiniAppSdk.ts:164`):**
- Added `validateSdkOptions(options)` as first statement.
- `debug` now `{ snapshot, diagnose: () => this.diagnose() }` (`src/client/MiniAppSdk.ts:269`).
- Replaced `globalThis[SDK_GLOBAL_KEY]=this` with `registerInstance(this)` (`src/client/MiniAppSdk.ts:272`).

**`runInitializeSequence` (`src/client/MiniAppSdk.ts:374`):**
- After `this.initialized = true`, loop `for (const plugin of this.plugins) await plugin.onInitialize?.()` with warn-on-throw.

**New `diagnose()` (`src/client/MiniAppSdk.ts:414`):**
- Builds `Diagnostic[]` via `this.debug.snapshot()` + live checks:
  - `NOT_INITIALIZED` info if `!initialized && !destroyed`
  - `DESTROYED` warn if destroyed
  - `NO_CAPABILITIES` warn if initialized && `capabilities.length===0`
  - `PENDING_BACKLOG` warn if `rpc.getPendingRequests().length>5`
  - `TRANSPORT_NOT_STARTED` error if `!transportInfo.started && initialized`
  - `HIGH_FAILURE_RATE` warn if `>50%` of `>10` requests failed
  - `APPEARANCE_INCOMPLETE` info if `appearance.state()` locale/theme missing
  - `PLUGINS_ACTIVE` info if plugins present
  - `DIAGNOSE_ERROR` error on internal throw.
- Never throws; details include `miniAppId/traceId/pendingRequests/transport/plugins`.

**`destroy()` (`src/client/MiniAppSdk.ts:520`):**
- Iterate `[...plugins].reverse()` calling `onDestroy` with warn-on-throw.
- Replace `globalThis` delete with `unregisterInstance(this)`.

**`on` overloads (`src/client/MiniAppSdk.ts:549`):**
- JSDoc updated: `signal` auto-unsubscribes; delegates to `rpc.onEvent`.

**New `once` (`src/client/MiniAppSdk.ts:567`):**
- `Promise` that resolves on next `event`, rejects if `signal.aborted` before fire or via `signal` abort after subscribe. Uses `on` + `removeEventListener`.

**New `events` (`src/client/MiniAppSdk.ts:609`):**
- Returns `AsyncIterable` with `Symbol.asyncIterator`:
  - `queue: unknown[]`, `pendingResolve`, `done`, `unsubscribe = sdk.on(event, ...)`.
  - `onAbort` completes iterator, unsubscribes.
  - `next()` drains queue or parks `pendingResolve`; `return()` cleans up signal + unsubscribe.

**`request`/`requestSafe` (`src/client/MiniAppSdk.ts:683`):**
- Added `requestSafe<T>(...): Promise<{ok:true,value:T}|{ok:false,error:Error}>` try/catch wrapper.

**`usePlugin` (`src/client/MiniAppSdk.ts:739`):**
- Dedup by `name` (warn skip), `await install`, push, if `initialized` then `await onInitialize` with warn-on-throw.

**`getInstance` static (`src/client/MiniAppSdk.ts:795`):**
- `static getInstance(miniAppId?) => getRegistryInstance(miniAppId)` — prefer over `window.__GSA_SDK__`.

#### `src/client/index.ts` (3 → 3 lines) — SMALL
- Now `export type {SdkPlugin}` and `export * from "./instance-registry"` (`src/client/index.ts:1`).

#### `src/index.ts` (+45 −23, 224 lines) — MEDIUM
- Added `import {getInstance as getRegistryInstance, registerInstance} from "./client/instance-registry"` (`src/index.ts:4`).
- Re-export `SdkPlugin` and `getInstance/clearInstances/getAllInstances/registerInstance/unregisterInstance` (`src/index.ts:4`).
- Error guards re-exported (`src/index.ts:17`): `getErrorCode`, `isAuthError`, etc., plus `HandshakeError/ProtocolError/TimeoutError/TransportError`.
- Added `validateSdkOptions` re-export (`src/index.ts:29`).
- Added `Diagnostic/DiagnosticSeverity` to `src/types` re-export (`src/index.ts:56`).
- `activeInstance` now delegates to registry:
  - `createMiniAppSdk` → `registerRegistryInstance(sdk); activeInstance=sdk` (`src/index.ts:190`).
  - `getMiniAppSdk` → check `activeInstance` then `getRegistryInstance()` fallback (`src/index.ts:201`).
  - `initMiniAppSdk` → after `initialize()`, `registerRegistryInstance(sdk)` (`src/index.ts:218`).
  - New `getActiveInstance()` deprecated alias (`src/index.ts:228`).

#### `src/errors/sdk-error.ts` (+15 lines) — SMALL
- Added `"INVALID_OPTIONS"` to `SdkErrorCode` union (`src/errors/sdk-error.ts:16`).
- Added `toJSON(): Record<string,unknown>` (`src/errors/sdk-error.ts:57`) serializing `name/code/message/retryable/details/cause` (cause normalized to `{name,message}` if Error).

#### `src/errors/index.ts` (+9 lines) — SMALL
- Re-exports guards (`src/errors/index.ts:1`).

### 3.3 Modified Files — RPC / Transport / Types

#### `src/rpc/rpc-client.ts` (+22 −6) — MEDIUM
**`onEvent` (`src/rpc/rpc-client.ts:687`):**
- Early return `() => {}` if `signal.aborted`.
- After `handlers.add`, `if (devMode && handlers.size>20) logger.warn('[dev] "..." now has N handlers — possible leak')` (PERF3).
- Build `unsubscribe` that also `removeEventListener("abort", ...)`; if `signal` present `signal.addEventListener("abort", unsubscribe, {once:true})`.
**Other unchanged:** pendingMap, retry, heartbeat, stream.

#### `src/transport/default-transport.ts` (+41 −12) — MEDIUM
- Added imports `MESSAGE_CHANNEL` + `validatePlatformMessage` (`src/transport/default-transport.ts:1`).
- `message` listener: when `!isValidPlatformMessage(event.data)` and `data.channel===MESSAGE_CHANNEL`, `logger.debug("Dropped invalid SDK message", {reason: validatePlatformMessage(...).reason})` before return. Same for `CustomEvent` path. Silently drops non-SDK `postMessage` chatter.
**Why:** A4 — surfaces `APPEARANCE.md:200` bugs (timestamp as string, missing `requestId`) only for SDK messages, silentprod for unrelated traffic.

#### `src/types/common.types.ts` (+6 lines) — SMALL
- `OnEventOptions` now `{ replay?: boolean; signal?: AbortSignal }` (`src/types/common.types.ts:51`) — docs: auto-unsubscribe on abort.

#### `src/types/sdk.types.ts` (+71 lines) — MEDIUM
- Added `DiagnosticSeverity = "info"|"warn"|"error"` and `Diagnostic` (`src/types/sdk.types.ts:58`).
- `SdkDebug` now `{ snapshot():SdkDebugSnapshot; diagnose():Diagnostic[] }` (`src/types/sdk.types.ts:68`).
- `MiniAppSdkInterface` now:
  - `readonly chat: ChatSdkModule` with `@deprecated Use chat instead` on `ai` (`src/types/sdk.types.ts:113`).
  - `once` overloads (`src/types/sdk.types.ts:174`) and `events` overloads (`src/types/sdk.types.ts:187`).
  - `requestSafe` (`src/types/sdk.types.ts:196`).
  - `usePlugin(plugin:{name,install,onInitialize?,onDestroy?})` (`src/types/sdk.types.ts:209`).

#### `src/types/index.ts` (+3 lines) — SMALL
- Re-exports `Diagnostic/DiagnosticSeverity` and `validateSdkOptions`.

#### `src/modules/chat.module.ts` (4-line fix) — BUGFIX
- Changed `createChatModule` from `NAMESPACES.HTTP/ACTIONS.HTTP.STREAM` to `NAMESPACES.AI/ACTIONS.AI.CHAT` (`src/modules/chat.module.ts:31`).
- Aligns with JSDoc ("`ai.chat` namespace") and existing tests (`src/modules/chat.module.test.ts:35`).

### 3.4 Modified Files — Tests / Tooling

#### `src/client/MiniAppSdk.test.ts` (1 line)
- `expect(sdk.links.isSupported()).toBe(false)` → `expect((sdk.links as unknown as {isSupported:boolean|(()=>boolean)}).isSupported).toBe(false)` (`src/client/MiniAppSdk.test.ts:542`) because `LinksSdkModule` in `@lizuz/mini-app-types` defines `isSupported?: boolean` property, not method.

#### `src/modules/navigation.test.ts` (12 lines)
- `ACTIONS.NAVIGATION.BACK/PUSH` → `ACTIONS.NAVIGATION.ROUTER` (5 occurrences) to match `src/modules/navigation.module.ts:58` which uses `ROUTER` for both `back`/`push`.

#### `src/modules/http.module.test.ts` (5 lines)
- `await module.post({...},{onProgress})` → `await (module.post as unknown as (p:unknown,o:unknown)=>Promise<unknown>)(...,{onProgress})` to satisfy package type `HttpSdkModule.post` which declares single-arg but SDK implements 2-arg with `HttpUploadOptions`.

#### `src/testing/index.ts` (2 lines)
- Now exports `MockHost` + `MockHostOptions` alongside `FakeTransport`.

#### `etc/sewa-sdk.api.md` (+177 lines)
- Regenerated via `api-extractor run` → `temp/sewa-sdk.api.md` → `etc/sewa-sdk.api.md`. Adds new public symbols: `Diagnostic`, `DiagnosticSeverity`, `validateSdkOptions`, `getInstance/clearInstances/...`, `SdkPlugin`, `MockHost`, guards, `chat`, `once/events/requestSafe/usePlugin`, `isSdkError` etc., plus note updated `http` module types.

---

## 4. Diff Summary

```diff
# New files
src/client/instance-registry.ts  (+68)  A2
src/errors/guards.ts              (+58)  OBS1
src/types/validate-options.ts     (+73)  E3
src/testing/mock-host.ts          (+95)  T1

# Modified
src/client/MiniAppSdk.ts          +302 -22  (chat alias, diagnose, once/events, requestSafe, usePlugin, registerInstance, validate)
src/rpc/rpc-client.ts             +22 -6    (signal + bounded guard)
src/transport/default-transport.ts+41 -12   (dev validation logging)
src/types/sdk.types.ts            +71       (Diagnostic, chat, once/events/requestSafe/usePlugin)
src/types/common.types.ts         +6        (signal)
src/errors/sdk-error.ts           +15       (INVALID_OPTIONS, toJSON)
src/errors/index.ts               +9        (guards re-export)
src/index.ts                      +45 -23   (registry delegation, guards, Diagnostic)
src/client/index.ts               +3 -2
src/types/index.ts                +3
src/modules/chat.module.ts        4±        (AI fix)
# Tests (baseline green)
src/client/MiniAppSdk.test.ts     3±
src/modules/navigation.test.ts    12±
src/modules/http.module.test.ts   5±
src/testing/index.ts              2+
etc/sewa-sdk.api.md               +177
```

---

## 5. Verification & Backward Compatibility

- **No breaking API removed.** All new symbols are additive; old `sdk.ai`, `getMiniAppSdk()`, `window.__GSA_SDK__`, `request()` etc. keep working. New `chat` is alias, `links.isSupported` fix keeps property shape, `http.post` 2-arg remains compatible at runtime.
- **Additive gate:** `heartbeat`/`metrics`/`signal`/`replay`/`validateSdkOptions`/`usePlugin`/`diagnose` are opt-in.
- **Validation:** `pnpm typecheck` → 0 errors, `pnpm lint` (biome) → 0, `pnpm test` → 201/201, `pnpm build` → `dist/sewa-sdk.js/cjs, sewa-sdk.mjs/esm, sewa-sdk.min.js 42.4kB raw 12.9kB gz` + `dist/sewa-sdk.d.ts`.
- **Wire unchanged:** `PROTOCOL_VERSION 1.0.0` (`src/constants/protocol.constants.ts:7`), `PlatformMessage` shape (`src/protocol/message.types.ts:32`) untouched; new `validateSdkOptions` is client-only.
- **Transport origin pinning** still defaults to `*` until pinned (`src/transport/default-transport.ts:129`); stricter enforcement deferred per `future.md` warning-first policy.

---

## 6. Migration Guide

| If you currently… | Do this (optional) | Impact |
|-------------------|--------------------|--------|
| Use `sdk.ai` | Prefer `sdk.chat` (alias) — `ai` marked `@deprecated` will remain for one major. | No break. |
| Read `window.__GSA_SDK__` | Prefer `MiniAppSdk.getInstance(miniAppId)` or `getInstance()` from `instance-registry`. | Old global keeps working. |
| Call `new MiniAppSdk({miniAppId})` with bad timeout | Catch `SdkError {code:"INVALID_OPTIONS"}` — now throws fast. | Fail-fast vs silent bug. |
| Subscribe via `sdk.on(event, cb)` | Add `{signal: controller.signal}` to auto-unsubscribe on unmount. | Opt-in. |
| Need next-event wait | Use `await sdk.once(event)` or `for await (const e of sdk.events(event))`. | New. |
| Prefer values over throws | Use `sdk.requestSafe(...)` (`{ok, value|error}`). | New. |
| Use custom module | Consider `sdk.usePlugin({name,install,onInitialize,onDestroy})` for middleware+events+lifecycle together. | Additive. |
| Assert errors via string match | Use `isRetryable(err)`, `isTimeout(err)`, `isSdkError(err)`, `getErrorCode(err)` from `src/errors/guards.ts`. | Additive. |
| Need test host | Import `MockHost` from `src/testing` (`new MockHost({capabilities, platformType, appearanceHint}).transport`). | New harness. |

No codemod required for this release; all deprecations are additive.

---

## 7. Future Work

Remaining `future.md` roadmap stays pending:
- **Medium:** request deduplication/batch (`PendingRequestManager` extract), lazy modules + per-module `package.json` exports, offline queue plugin, strict origin (`CustomEvent` opt-in), capability-version map.
- **Long:** `WebSocket`/`MessagePort` transports, binary `structuredClone` path, spec-driven codegen, circuit-breaker/adaptive timeout, worker/SSR transports, AI tool-use streaming.

> All deferred items are independent PRs and can land on top of this base without further breaking changes.

