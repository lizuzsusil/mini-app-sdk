# Future Architecture & Modernization Plan — `@lizuz/sewa-sdk` v1.0.8

> Framework-agnostic Mini App SDK. Event-based host↔mini-app RPC. Reviewed 2026-08-27 against `src/**`, `package.json:4`, `PROTOCOL_VERSION 1.0.0` at `src/constants/protocol.constants.ts:7`, `etc/sewa-sdk.api.md`, `enhancement.md`, `APPEARANCE.md`.
> This document is the single source for “what next” — it analyzes the existing architecture, names every gap, and gives a prioritized, backward-compatible roadmap. For each proposal it covers: **why it is needed, problem solved, expected impact, implementation, risks, and backward-compatibility**.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Snapshot](#2-current-architecture-snapshot)
3. [Deep Analysis by Dimension](#3-deep-analysis-by-dimension)
   - 3.1 Architecture & Refactor Opportunities
   - 3.2 Missing Features & Capabilities
   - 3.3 API & Ergonomics Improvements
   - 3.4 Backward Compatibility Strategy
   - 3.5 Versioning, Deprecation & Migration
   - 3.6 Extensibility & Plugin Architecture
   - 3.7 Performance, Scalability, Reliability
   - 3.8 Security, Auth & Data Protection
   - 3.9 Error Handling, Observability, Debugging
   - 3.10 Testing Strategy
   - 3.11 Documentation, Examples, Tooling & DX
   - 3.12 Future Technologies & Platforms
   - 3.13 Automation & Intelligent Features
4. [Cross-Cutting Governance](#4-cross-cutting-governance)
5. [Prioritized Roadmap](#5-prioritized-roadmap)
6. [Appendix](#6-appendix)

---

## 1. Executive Summary

**What the SDK gets right today:** Clean composition root `src/client/MiniAppSdk.ts:106`, narrow `Transport` abstraction `src/transport/transport.ts:17`, deterministic `ModuleRegistry` `src/modules/module-registry.ts:19`, typed `PlatformMessage` envelope `src/protocol/message.types.ts:32`, jittered exponential backoff `src/utils/backoff.ts:28`, capability negotiation in `RpcClient.handshake()` `src/rpc/rpc-client.ts:261`, and mature quality gates (api-extractor `api-extractor.json:2`, CI `.github/workflows/ci.yml`, size budget `scripts/check-size.mjs`, source maps).

**Where it must evolve:** `RpcClient` is a 1,152-line god object mixing correlation, retry, heartbeat, streaming, and events `src/rpc/rpc-client.ts:140`. The wire protocol is pinned to `postMessage` JSON + major-only compat `src/protocol/message-validator.ts:149`. Module surface has inconsistencies (`ai` vs `ChatModule`, `http.getStream` type masquerade `src/modules/http.module.ts:103`). Security is origin-pinning only with a `CustomEvent` bypass `src/transport/default-transport.ts:84`. Metrics/observability are in-memory only `src/observability/metrics-recorder.ts:64`. Tests are unit-only; no host mock, contract, or compat matrix.

**Roadmap thesis:** Keep every change additive and default-off behind option flags or capabilities. Ship reliability and DX wins first (short-term), then extensibility and performance (medium-term), then platform/protocol evolution and intelligence (long-term). No breaking change without a `2.x` major and codemods.

---

## 2. Current Architecture Snapshot

### 2.1 Layer Diagram (as built)

```
mini-app code
  │
  ├─ MiniAppSdk (composition root) ── ModuleRegistry ── {auth, permissions, flags, config, navigation, platform, device, api, http, ai, appearance, notifications, links}
  │     │
  │     └─ RpcClient ─── MetricsRecorder, Tracer (noopTracer), Middleware chain
  │            │
  │            └─ Transport (DefaultTransport: window.parent.postMessage + CustomEvent gov-platform-event)
  │
  └─ cdn.ts IIFE (reads window.__GSA_SDK__ as MiniAppSdkOptions, overwrites with instance)
  └─ index.ts helpers (activeInstance singleton via createMiniAppSdk/getMiniAppSdk/initMiniAppSdk)
```

**Message kinds:** `request|response|event|handshake|stream` `src/protocol/message.types.ts:7`. Handshake negotiates `protocolVersion` + `capabilities: string[]` `src/protocol/message.types.ts:62`. Appearance hydrates via `platform.getType` hint fallback to `appearance.getTheme/Locale` with 1200 ms budget `src/client/MiniAppSdk.ts:91`.

### 2.2 Verified Strengths

* **Separation of concerns:** `Transport` knows nothing about RPC semantics; modules depend only on `RpcClient` — host swap is trivial.
* **Capability negotiation is permissive-by-default** (`src/rpc/rpc-client.ts:954` assumes full support if host omits `capabilities`), preserving old shells.
* **Reliability primitives already shipped:** abortable requests `src/rpc/rpc-client.ts:49`, heartbeat/reconnect opt-in `src/types/sdk.types.ts:160`, replay buffer `src/rpc/rpc-client.ts:177`, dev-mode warnings `src/rpc/rpc-client.ts:390`.
* **Quality rails:** api-extractor rollup `src/index.ts:1`, `dist/sewa-sdk.d.ts`, CI publish gate, 30 kB gzipped budget.

### 2.3 Structural Risks

| Risk | Location | Consequence |
|------|----------|-------------|
| God object RpcClient | `src/rpc/rpc-client.ts:140` | Change amplification, hard to test reconnect/heartbeat isolation |
| Dual singletons | `src/index.ts:153` + `src/cdn.ts:42` | Two “global instance” stories; confusion for SSR/testing |
| Duplicate type definitions | `src/types/common.types.ts:58` vs `@lizuz/mini-app-types` | Drift risk noted in `APPEARANCE.md:224` |
| Silent validator drops | `src/protocol/message-validator.ts:47` + `src/rpc/rpc-client.ts:1068` | Invalid host messages time out with no log unless devMode |
| Eager module build | `src/client/MiniAppSdk.ts:198` | No lazy / code-split per mini-app feature slice |
| Bidirectional events lack schema | `src/constants/namespaces.constants.ts:149` | Typos fail silently; no versioned event payloads |

---

## 3. Deep Analysis by Dimension

> Each item follows the required template: **Why → Problem → Impact → Implementation → Risks → Backward-Compatible Introduction**.

### 3.1 Architecture & Refactor Opportunities

#### A1 — Decompose RpcClient into focused collaborators

* **Why:** `RpcClient` owns correlation map `pending`, timers, retry loop `executeWithRetry`, handshake `performHandshake`, heartbeat `startHeartbeat`, streaming `streamConsumers`, event buffers `eventReplayBuffer`. One change risks unrelated behavior.
* **Problem solved:** Testability, independent evolution (e.g., swapping retry policy without touching heartbeat).
* **Impact:** −40% cyclomatic complexity in client, faster PR reviews, unit tests can mock `PendingRequestManager` without a transport.
* **Implementation:** Introduce `PendingRequestManager`, `HandshakeManager`, `HeartbeatManager`, `StreamManager`, `EventHub`, `CapabilityStore`. `RpcClient` becomes façade delegating to them. Keep public method signatures identical. File moves: `src/rpc/pending-request-manager.ts`, `src/rpc/heartbeat-manager.ts`, etc.
* **Risks:** Extracted collaborators must preserve timer cleanup semantics in `stop()` `src/rpc/rpc-client.ts:218`. Mitigate with characterization tests that snapshot pending/stream maps before/after.
* **Compat:** No public API change; internal only. Ship as patch/minor.

#### A2 — Unify global singleton story

* **Why:** `activeInstance` in `src/index.ts:153` and `window.__GSA_SDK__` in `src/cdn.ts:20` / `src/client/MiniAppSdk.ts:248` serve overlapping “one mini app per tab” needs with different lifecycles. SSR and tests must mock `window`.
* **Problem solved:** Eliminates “which global am I reading?” bugs; enables Worker/SSR usage where `window` is absent.
* **Impact:** Predictable instance lookup, easier testing with injected globals.
* **Implementation:** Introduce `src/client/instance-registry.ts` with `setActiveInstance`/`getActiveInstance` keyed by `miniAppId`; `cdn.ts` and `index.ts` both delegate. Add `MiniAppSdk.getInstance(miniAppId?)` static accessor. Keep `getMiniAppSdk()` as alias, mark alias `@deprecated`.
* **Risks:** Existing consumers reading `window.__GSA_SDK__` directly keep working — registry writes to both keys during transition.
* **Compat:** Additive; deprecate old getter over two minors.

#### A3 — Consolidate type sources

* **Why:** `PlatformTypeLiteral`, `AppearanceType`, `PlatformTypeResponse` defined locally `src/types/common.types.ts:58` and in `@lizuz/mini-app-types`. `src/client/MiniAppSdk.ts:55` imports package types while `src/modules/platform.module.ts` imports local — compiles only because they happen to match (`APPEARANCE.md:224`).
* **Problem solved:** Prevents subtle drift (e.g., adding a platform breaks only one import site).
* **Impact:** Single source of truth, versioned via package.
* **Implementation:** Move `AppearanceType`/`PlatformTypeResponse` to `@lizuz/mini-app-types` (already planned in `APPEARANCE.md:220`), re-export locally for one release, then delete locals. Add `scripts/check-versions.mjs` extension to fail if local re-export diverges.
* **Risks:** Requires coordinated publish of `mini-app-types`; pin SDK peer range `^1.0.x` and document migration.
* **Compat:** Re-export keeps import paths working; removal after min 6 months.

#### A4 — Decouple message validation from dispatch

* **Why:** `isValidPlatformMessage` returns `false` with no side effect; caller silently drops `src/transport/default-transport.ts:77` and `src/rpc/rpc-client.ts:1068`.
* **Problem solved:** Debuggability of malformed host messages (timestamp as string, missing `requestId` — common Flutter bridge bug noted in `APPEARANCE.md:200`).
* **Impact:** 10–20 min saved per host integration issue.
* **Implementation:** In `devMode`, log `validatePlatformMessage(...).reason` at `warn`; expose `SdkError` with `code:"INVALID_MESSAGE"` instead of silent drop. Production stays silent to avoid noisy cross-origin `postMessage` traffic.
* **Risks:** Verbose logs in dev if page has unrelated `postMessage` chatter — filter by `channel === MESSAGE_CHANNEL` before logging (already validated).
* **Compat:** Additive; gated on `devMode`.

---

### 3.2 Missing Features & Capabilities

#### F1 — Offline queue & cache (P1)

* **Why:** Mobile WebViews lose connectivity; today `TimeoutError` retries then throws, discarding user intent.
* **Problem solved:** Enqueue `storage.set`, `api.request`, `navigation.navigate` while `navigator.onLine === false` or `connection.lost` `src/constants/namespaces.constants.ts:161`, replay on `connection.established`.
* **Impact:** Offline-first mini apps, fewer support tickets.
* **Implementation:** New `src/offline/offline-queue.ts` (persisted via `storage` or `IndexedDB` adapter). Config `offline: {queue: true, maxEntries: 50, ttlMs}`. Integrate as middleware that short-circuits to queue when offline and `namespace` is allowlisted.
* **Risks:** Idempotency — queue only idempotent actions unless caller marks `idempotencyKey`. Mitigate with allowlist defaulting to safe namespaces.
* **Compat:** Opt-in option; queue disabled if omitted.

#### F2 — Structured file upload/download with resume

* **Why:** `device.files`/`gallery`/`camera` return blobs via RPC but no progress, resume, or chunking for large assets.
* **Problem solved:** Large uploads reliably complete on flaky mobile.
* **Impact:** Media-heavy mini apps become viable.
* **Implementation:** Extend `src/modules/device.module.ts` + `src/modules/http.module.ts` with `upload({endpoint, file, chunkSize, onProgress})` using streaming `sendStreamRequest` already proven for AI chat `src/rpc/rpc-client.ts:542`. Host must support `device.upload` capability.
* **Risks:** Host without new capability must be detected via `isSupported`; fallback to single-shot upload.
* **Compat:** New methods; no existing signature change.

#### F3 — Native-adjacent APIs (share, clipboard, haptics, biometrics prompt opts)

* **Why:** `device` namespace covers 9 actions `src/modules/device.module.ts:25` but not `share`, `clipboard`, `haptics`, `review`. Each today requires a host fork.
* **Problem solved:** Competitive parity with Capacitor/Tauri SDKs.
* **Impact:** Host can ship features without SDK fork.
* **Implementation:** Add `DeviceAction` union members + modules under `src/modules/device/*` split (see A1). Each action thin wrapper over `rpc.request`.
* **Risks:** Permission model diversity — gate with per-action capability object (see 3.5).
* **Compat:** New union members; `isSupported` handles unknown actions gracefully (`DEVICE_ACTIONS.includes` check `src/modules/device.module.ts:40`).

#### F4 — SSR / Worker / Edge compatibility

* **Why:** `DefaultTransport` throws if `window` missing `src/transport/default-transport.ts:61`; `HostDescriptor` reads `window.__GSA_HOST_DESCRIPTOR__` `src/client/MiniAppSdk.ts:155`.
* **Problem solved:** Next.js App Router, Service Workers, Web Workers.
* **Impact:** SDK usable in SSR prefetch and off-main-thread contexts.
* **Implementation:** Provide `WorkerTransport`, `SsrNoopTransport`; move `window` access behind `globalThis` abstraction `src/transport/env.ts`. `hostDescriptor` resolution tries `globalThis` then env var.
* **Risks:** SSR bundle must not include DOM polyfills — use conditional exports `src/index.ts` exports map `browser` vs `import`.
* **Compat:** Additive transports; existing web build unchanged.

---

### 3.3 API & Ergonomics Improvements

#### E1 — Normalize naming & fix type masquerade

* **Why:** Public surface exposes `sdk.ai: ChatSdkModule` (`src/client/MiniAppSdk.ts:123`) but module is chat — confusing. `http.getStream` returns `Promise<T>` cast from `StreamBuilder` `src/modules/http.module.ts:103` — breaks `await sdk.http.getStream(...)` expectations.
* **Problem solved:** Discoverability, type safety.
* **Impact:** Fewer type assertions in consumer code.
* **Implementation:** Alias `sdk.chat` alongside `sdk.ai` (keep `ai` as deprecated getter). Fix `getStream` to return `Promise<StreamBuilder>`; overload `stream` correctly. Change is `api-extractor` break → minor deprecation, major removal.
* **Risks:** Consumers using `ai` keep working; codemod `ai→chat` provided.
* **Compat:** Add alias, add `@deprecated` JSDoc, remove in next major.

#### E2 — First-class async event helpers & AbortSignal for subscriptions

* **Why:** `sdk.on(event, handler)` returns `unsubscribe` `src/client/MiniAppSdk.ts:413` but no `once(event)` promise or `for await` iterable. No way to tie subscription lifetime to component mount without manual cleanup.
* **Problem solved:** Framework hooks (`useEffect` + `AbortSignal`) and `for await (const evt of sdk.events('x'))` patterns.
* **Impact:** Less boilerplate, fewer leak bugs.
* **Implementation:** Add `sdk.once(event, {signal})`, `sdk.events(event, {signal}) : AsyncIterable<T>`, and `on(event, handler, {signal})` overload where `signal.abort()` auto-unsubscribes. Implemented atop existing `eventHandlers` map `src/rpc/rpc-client.ts:152`.
* **Risks:** AsyncIterable must buffer while no consumer — bound by replay buffer size.
* **Compat:** Additive overloads.

#### E3 — Validation & fluent builder for options

* **Why:** `MiniAppSdkOptions` allows any timeout/retry combo `src/types/sdk.types.ts:175`; invalid `targetOrigin` or negative `retryAttempts` fails late.
* **Problem solved:** Fail fast with actionable `SdkError` at construction.
* **Impact:** Host integration errors caught in dev, not on first request timeout.
* **Implementation:** Add `validateSdkOptions(options)` called in `MiniAppSdk` ctor. Provide `createSdkOptions({...}).validate().build()` builder for discoverability.
* **Risks:** Strict validation may reject previously tolerant inputs — default to warning in first minor, error in next.
* **Compat:** Validation error code `INVALID_OPTIONS` additive; previously invalid configs were already buggy.

#### E4 — Result-type alternative (optional)

* **Why:** All errors throw `SdkError` subclasses `src/errors/sdk-error.ts:37`; consumers must try/catch per call. Some prefer `Result<T, E>`.
* **Problem solved:** Railway-oriented error handling.
* **Impact:** Ergonomics for functional codebases.
* **Implementation:** Add `sdk.requestSafe(...) : Promise<Result<T, SdkError>>` helper; keep throwing `request` canonical.
* **Risks:** Two error styles to document.
* **Compat:** Additive.

---

### 3.4 Backward Compatibility Requirements & Strategies

**Current contract strengths:** `PROTOCOL_VERSION` major-only check `src/protocol/message-validator.ts:149` and capability permissive fallback `src/rpc/rpc-client.ts:954` already protect old hosts. `SdkEventMap` keeps `string` overload fallback `src/types/common.types.ts:19`.

**Required strategies going forward:**

* **SemVer discipline:** `MAJOR` = breaking public API or wire format; `MINOR` = additive capabilities/methods; `PATCH` = bugfix. Enforce via `api-extractor` report `etc/sewa-sdk.api.md` + `check-versions.mjs` already present.
* **Additive-first evolution:** New namespaces/actions are new strings in `src/constants/namespaces.constants.ts:6`; old strings never reused. New fields on `PlatformMessage` / `HandshakePayload` optional with defaults.
* **Capability-version map (replaces string[] in next minor):** Extend `HandshakeAckPayload.capabilities` `src/protocol/message.types.ts:76` to accept `Record<string,string>` version ranges while keeping `string[]` backward compatible (detect via `Array.isArray`). SDK picks highest mutually supported minor.
* **Deprecation via alias + warnOnce:** Keep old symbol, mark `@deprecated`, proxy to new implementation, log once in `devMode` — e.g., `sdk.ai` → `sdk.chat`.
* **No silent removal:** Any removal requires a major and a codemod under `scripts/codemods/`.

---

### 3.5 Versioning, Deprecation & Migration

* **Version sources:** `package.json:4` version, `PROTOCOL_VERSION` `src/constants/protocol.constants.ts:7`, `RPC_CLIENT_SDK_VERSION` `src/constants/version.generated.ts` (generated prebuild). Triple must stay in sync — extend `scripts/check-versions.mjs` to validate all three.
* **Protocol negotiation v1.1:** Add `protocolVersionRange: string` (e.g., `^1.0.0`) to `HandshakePayload` alongside `protocolVersion` for future minor negotiation; hosts advertise `supportedVersions: string[]`. SDK selects max compatible major (current behavior) then max minor.
* **Deprecation lifecycle (2 minors):**
  1. Minor N: add new symbol, mark old `@deprecated`, add `devMode` warnOnce, ship codemod `npx @lizuz/sewa-codemods ai-to-chat`.
  2. Minor N+1: old symbol still works but docs remove it.
  3. Major N+2: remove, fail `api-extractor` until removed.
* **Migration artifacts:** `MIGRATION.md`, `CHANGELOG.md` automation via `release-please` (previously removed per `enhancement.md:109` — reinstate or use `changesets`), codemods under `scripts/codemods/`.
* **Consumer policy:** Hosts pin `^1.0` via peer; SDK tests compat matrix `1.0.x` vs host `1.0.x` and `2.x` alpha.

---

### 3.6 Extensibility & Plugin/Modular Architecture

#### P1 — Formal Plugin interface (beyond registerModule)

* **Why:** `registerModule` `src/client/MiniAppSdk.ts:487` + `ModuleRegistry` `src/modules/module-registry.ts:28` allow a factory `(rpc)=>T` but no lifecycle, no access to events/metrics/logger, no ordering, no cleanup.
* **Problem solved:** Auth-token refresh, cache, offline queue all want to wrap requests *and* listen to events *and* hook `initialize`/`destroy`.
* **Impact:** Hosts can compose behavior without forking SDK.
* **Implementation:**
  ```ts
  interface SdkPlugin {
    name: string;
    install(ctx: { sdk: MiniAppSdk; rpc: RpcClient; logger: Logger }): void | Promise<void>;
    onInitialize?(): Promise<void>;
    onDestroy?(): void;
  }
  sdk.usePlugin(authRefreshPlugin({ getToken }))
  ```
  Plugins register middleware `rpc/middleware.ts:34`, event listeners, and `ModuleRegistry` entries via same context. Execution order = install order; `onDestroy` called in reverse.
* **Risks:** Plugin ordering bugs — document and provide `before/after` constraints.
* **Compat:** Additive `usePlugin`; existing `use`/`registerModule` remain.

#### P2 — Lazy & tree-shakable modules

* **Why:** All 11 namespaces eagerly built `src/client/MiniAppSdk.ts:186`; a mini app using only `auth` + `storage` ships dead code.
* **Problem solved:** Smaller bundles, faster cold start.
* **Impact:** Import cost proportional to usage.
* **Implementation:** Change `ModuleRegistry` to support `registerLazy(name, () => import('./device.module'))`; build on first `get`. Re-export per-module entry points `exports["./device"]` in `package.json:11`. CDN IIFE stays monolithic (one tab) but lib build becomes tree-shakable.
* **Risks:** Async first-access latency — prewarm during `initialize()` if capability present.
* **Compat:** Lazy registry is internal; existing `registerModule` stays sync; new `registerLazy` additive.

#### P3 — Interceptors for events & payloads

* **Why:** Middleware wraps `request` only `src/rpc/middleware.ts:34`; events `src/rpc/rpc-client.ts:687` and payload mapping `src/rpc/rpc-client.ts:63` have no hook.
* **Problem solved:** Global payload transforms, event filtering, redaction before metrics.
* **Impact:** Single place for cross-cutting concerns.
* **Implementation:** Add `addEventInterceptor((event, payload) => payload|false)` returning unsubscribe. Existing tracing `src/observability/tracer.ts` can move to interceptor rather than hard-coded spans.
* **Risks:** Interceptor throwing must not drop events — wrap in try/catch and log.
* **Compat:** Additive.

---

### 3.7 Performance, Scalability, Reliability & Resource Efficiency

#### PERF1 — Request deduplication & coalescing

* **Why:** Parallel identical `permissions.has('camera')` or `config.get('x')` each send a new envelope with distinct `requestId` `src/protocol/message-factory.ts:33`.
* **Problem solved:** Fewer host round trips, less pending-map churn.
* **Impact:** 2–3× fewer messages on dashboard mounts.
* **Implementation:** `PendingRequestManager` keyed by `namespace|action|JSON(payload)`; concurrent duplicate calls share one `requestId` promise and fan out. Opt-out via `options.dedupe:false` or per-action allowlist (don’t dedupe `device.location`).
* **Risks:** Dedupe window must be short (≈50 ms) to avoid staleness; opt-out needed for side-effect actions.
* **Compat:** Opt-in flag, default dedupe on for idempotent actions only.

#### PERF2 — Backpressure & batch API

* **Why:** Burst of `storage.get` calls on hydration has no batch path — each is a postMessage.
* **Problem solved:** One host RPC instead of N.
* **Impact:** Lower latency, less GC.
* **Implementation:** Add `sdk.storage.getMany(keys)` + generic `rpc.batch([...requests])` that host may honor as atomic batch (`namespaces: ["batch"]`). Client falls back to parallel if host doesn’t negotiate `batch`.
* **Risks:** Partial failure semantics — return `BatchResult<T>[]` with per-item error.
* **Compat:** New methods; negotiation gated.

#### PERF3 — Memory bounds & GC

* **Why:** `eventReplayBuffer` bounded `5` `src/rpc/rpc-client.ts:127` good; `metricsRecorder` already bounds durations `100` `src/observability/metrics-recorder.ts:8`; but `eventHandlers` Set + `pending` Map grow with mini-app lifetime and `stop()` clears all `src/rpc/rpc-client.ts:244`.
* **Problem solved:** Long-lived shell tabs don’t leak.
* **Impact:** Stable heap after hours.
* **Implementation:** Add `maxEventHandlersPerEvent` guard (warn in devMode if >20). Periodic `metricsRecorder` pruning already `samplesWithinWindow` `src/observability/metrics-recorder.ts:173` — expose `resetMetrics()` and auto-prune on `connection.lost`.
* **Risks:** Too-aggressive pruning hides outliers — make thresholds configurable via `metrics` option.
* **Compat:** New warnings/limits, default generous.

#### REL1 — Circuit breaker & adaptive timeout

* **Why:** Today retry is fixed backoff `src/rpc/rpc-client.ts:412`; a dead host is retried N times per call for every caller.
* **Problem solved:** Fail fast when host is known-degraded; recover gracefully.
* **Impact:** Better UX (immediate “host unavailable” vs spinners stacking).
* **Implementation:** Circuit breaker per `namespace.action` (closed → open after K failures → half-open trial). Adaptive timeout: EMA of observed durations via `MetricsRecorder` → set next timeout to `p95 * 1.5` bounded by `timeout` option.
* **Risks:** Tuning thresholds wrong — ship disabled by default, document tuning.
* **Compat:** Additive via `reliability: {circuitBreaker, adaptiveTimeout}` options.

---

### 3.8 Security, Authentication, Authorization & Data Protection

#### SEC1 — Harden transport boundary

* **Why:** `CustomEvent` channel `src/transport/default-transport.ts:84` has no origin check; `window.parent.postMessage` target defaults to `*` until pinned `src/transport/default-transport.ts:129`; any frame can spoof `gov-platform-event`.
* **Problem solved:** Closes spoof/eavesdrop vectors in embedded contexts.
* **Impact:** Hardened embedded security posture.
* **Implementation:** (1) Require `allowedOrigin` / `targetOrigin` in production — warn in dev if `*`. (2) Add `verifyMessageSource` hook: `Transport` option `(msg, event)=>boolean` so Flutter bridge can verify via native channel. (3) `CustomEvent` path requires opt-in `allowCustomEvent:false` default; Flutter enables explicitly.
* **Risks:** Stricter origin breaks existing `*` deployments — migration path: warn for one minor, fail with clear error message listing expected origin.
* **Compat:** Warning first, enforcement later; additive hook.

#### SEC2 — Message authenticity & replay protection

* **Why:** No nonce/HMAC; replayed `response` with reused `requestId` could resolve wrong promise if host is compromised.
* **Problem solved:** Tamper/replay resilience.
* **Impact:** Stronger trust boundary for financial mini apps.
* **Implementation:** Add optional `hmacKey` in `HandshakePayload` negotiation; SDK and host sign `requestId+traceId+timestamp` with HMAC-SHA256 (WebCrypto). Verify in `handleIncomingMessage` `src/rpc/rpc-client.ts:1065`. Keep optional — old hosts skip verification. Nonce = `requestId` already unique `src/utils/id.ts`.
* **Risks:** Crypto availability in older WebViews — feature-detect and fallback to no-HMAC with log.
* **Compat:** Opt-in handshake extension; old hosts complete handshake without HMAC.

#### SEC3 — Data protection beyond shallow logger redaction

* **Why:** `ConsoleLogger` redacts top-level keys only `src/logging/console-logger.ts:93`; `MetricsRecorder` and `Tracer` carry full `payload` attributes `src/rpc/rpc-client.ts:265`/`358`.
* **Problem solved:** PII not persisted in metrics/tracing backends.
* **Impact:** Compliance (GDPR/PII) safety.
* **Implementation:** Add `redact: {keys, deep, paths}` shared config plumbed to logger, metrics `onSnapshot` filter, tracer `setAttribute` filter via `src/observability/tracer.types.ts`. Default redact set includes `token`, `authorization`, `password`, `ssn`.
* **Risks:** Over-redaction hides debuggability — provide `devMode: unsafeExposeForDebug` flag.
* **Compat:** Additive `redact` option; default conservative.

#### SEC4 — AuthZ clarity & permission model evolution

* **Why:** `permissions.has()` / `list()` `src/constants/namespaces.constants.ts:62` cover only string permissions; no resource-scoped or time-boxed grants.
* **Problem solved:** Fine-grained device permission UIs.
* **Impact:** Host can expose richer consent.
* **Implementation:** Extend `PermissionsSdkModule` with `request(permission, {reason})` and handle `DevicePermissionStatus` union already present. Wire to device module’s `DevicePermissionBaseResponse` `src/types/device.types.ts`.
* **Risks:** Permission string proliferation — central registry in `mini-app-types`.
* **Compat:** Additive methods.

---

### 3.9 Error Handling, Observability, Logging & Debugging

#### OBS1 — Structured error taxonomy & recovery guide

* **Why:** `SdkErrorCode` union `src/errors/sdk-error.ts:8` + subclasses (`HandshakeError`, `TimeoutError`, `HttpClientError`…) exist but no decision table for consumers (“retry?”, “show dialog?”, “re-init?”).
* **Problem solved:** Consistent UX for degraded host.
* **Impact:** Fewer ad-hoc `if (message.includes('timeout'))` checks.
* **Implementation:** Add `isRetryable(error)`, `isAuthError(error)`, `isTimeout(error)` guards + `SdkError.toJSON()` for serialization. Document recovery matrix in `docs/errors.md` and generate from `src/errors/index.ts`.
* **Risks:** Guard adds surface — keep trivial and pure.
* **Compat:** Additive.

#### OBS2 — Observable lifecycle events & diagnostics channel

* **Why:** Today only `debug.snapshot()` `src/types/sdk.types.ts:66` / `sdk.getMetrics()` poll; no push for diagnostics.
* **Problem solved:** Host can stream SDK diagnostics to centralized logging without polling.
* **Impact:** Real-time host observability.
* **Implementation:** Expose `sdk.on('sdk.diagnostic', handler)` events for `handshake_failed`, `invalid_message`, `retry_exhausted`, `circuit_open`. Pipe to existing `RpcMetricsOptions.onSnapshot` `src/observability/metrics.types.ts` already additive pattern.
* **Risks:** Event volume — sample/throttle diagnostics.
* **Compat:** Additive events added to `SdkEventMap`.

#### OBS3 — Deep logger redaction & correlation

* **Why:** Current `ConsoleLogger` `src/logging/console-logger.ts:86` writes to console only; no correlation across host↔client.
* **Problem solved:** Trace a mini-app request end-to-end.
* **Impact:** Support can correlate `traceId` `src/protocol/message.types.ts:43` across logs.
* **Implementation:** Logger accepts `format: 'json'` for host ingestion; always includes `traceId`, `requestId`, `miniAppId`. Provide `pino` adapter example in docs.
* **Risks:** JSON logs larger — off by default.
* **Compat:** Additive option.

---

### 3.10 Testing Strategy

**Current:** `biome check` + `vitest run` + `api-extractor` build gate `package.json:34`. Unit tests exist for `rpc-client`, `device`, `appearance`, `metrics`, `console-logger` but per `enhancement.md:104` had stale constants — coverage is uneven.

#### T1 — Layered test pyramid

* **Unit (existing, strengthen):** Cover `message-validator` fuzz (property-based: random strings must not pass), `backoff` jitter distribution `src/utils/backoff.ts:35`, `ModuleRegistry` idempotency, `StreamBuilder` out-of-order delivery `src/stream/stream-builder.ts:57`, `DefaultTransport` origin pinning.
* **Integration (new):** `MockHost` + `MockTransport` harness (`src/testing/mock-host.ts`) that speaks real `PlatformMessage` / `HandshakePayload`. Tests `MiniAppSdk.initialize()` happy path, appearance hint vs hydration fallback (`APPEARANCE.md:30`), heartbeat reconnect, streaming.
* **Contract (new):** Pact-style consumer tests generated from `etc/sewa-sdk.api.md` + `mini-app-types` — fail if SDK sends payload host doesn’t expect.
* **Compatibility (new):** Matrix workflow `.github/workflows/compat.yml` running SDK `1.0.x` against host mocks for `1.0`, `1.1-alpha`, `2.0-alpha`; major-only compat `src/protocol/message-validator.ts:149` exercised.
* **Regression / a11y / perf (new):** `vitest --run --coverage --branchThreshold 85` gate; size check `scripts/check-size.mjs` already 30 kB; add latency benchmark `scripts/bench.mjs` for p50/p99 of `request` via metrics.
* **Why/Compat:** All additive files under `src/testing/` unused in production; CDN build tree-shakes them.

---

### 3.11 Documentation, Examples, Tooling & Developer Experience

#### DX1 — Generated API reference & live playground

* **Why:** `README.md:108` hand-maintains module table; already diverged from package types.
* **Problem solved:** Reference never drifts.
* **Impact:** Onboarding time halved.
* **Implementation:** TypeDoc from `etc/sewa-sdk.api.md` → `docs/api/`, publish to GitHub Pages. StackBlitz playground `examples/vanilla`, `examples/react` with `MockHost`. Link from `README.md:5`.
* **Risks:** Docs build time — cache in CI.
* **Compat:** Docs only.

#### DX2 — Scaffolder & lint plugin

* **Why:** No `create-mini-app` CLI; no migration path for `ai→chat`, `targetOrigin` rename.
* **Problem solved:** One-command bootstrap.
* **Impact:** Adoption velocity.
* **Implementation:** `create-sewa-mini-app` (degit template + `sdk.initialize` wiring). `eslint-plugin-sewa-sdk` rule `no-deprecated-ai` reading api-extractor report.
* **Risks:** Template maintenance — version matrix in `scripts/check-versions.mjs` checks template pin.
* **Compat:** Tooling repo separate; SDK peer unchanged.

#### DX3 — Error catalog & troubleshooting guide

* **Why:** `APPEARANCE.md:199` debugging notes live separate; `HOST_ERROR` `src/errors/sdk-error.ts:21` opaque.
* **Problem solved:** Self-serve host integration.
* **Impact:** Fewer support tickets.
* **Implementation:** `docs/troubleshooting.md` (invalid timestamp string, echoed `requestId`, `CustomEvent` detail shape). `docs/errors.md` mapping `SdkErrorCode` → retryable?, user-visible message, recovery action.
* **Risks:** Stale docs — generate error table from `src/errors/*` at build.
* **Compat:** Docs only.

---

### 3.12 Support for Future Technologies, Platforms, Protocols & Emerging Use Cases

#### FUT1 — Transport evolution (WebSocket / WebTransport / MessagePort)

* **Why:** `postMessage` `src/transport/default-transport.ts:132` is universal but lossy under pressure; future shells (dedicated Worker host, multi-tab) want persistent sockets.
* **Problem solved:** Host can pick best channel per environment.
* **Impact:** Lower latency, binary support, multi-tab sync.
* **Implementation:** `WebSocketTransport`, `MessagePortTransport`, `BroadcastChannelTransport` implementing `Transport` `src/transport/transport.ts:17`. Negotiate via `HandshakePayload` transport hint (`capabilities` extension). Fallback chain `WebSocket → postMessage`.
* **Risks:** Socket teardown vs `stop()` `src/rpc/rpc-client.ts:218` semantics — reuse heartbeat `src/rpc/rpc-client.ts:808` over socket to detect liveness.
* **Compat:** New transports additive; `DefaultTransport` stays default.

#### FUT2 — Binary & structured payloads

* **Why:** `PlatformMessage.payload` typed `unknown` JSON today; AI streaming sends `string|Uint8Array` chunks `src/stream/stream-builder.ts:58` but transport still JSON-stringifies via `postMessage` clone.
* **Problem solved:** Efficient binary (camera/gallery), CBOR alternative.
* **Impact:** Large payloads not double-encoded.
* **Implementation:** `Transport` `send` accepts `Transferable`; `DefaultTransport` uses `structuredClone` path when host advertises `binary` capability. Negotiated via handshake; fallback to JSON.
* **Risks:** `Uint8Array` cloning cost — benchmark.
* **Compat:** Capability-gated; old hosts see JSON.

#### FUT3 — AI & multimodal evolution

* **Why:** `ai.chat` + `StreamBuilder` + `ChatMessages` helpers `src/modules/chat.module.ts` handle text streaming; emerging needs are function calling, tool use, multimodal (image input), streaming JSON.
* **Problem solved:** Mini apps can build agentic UIs without host fork.
* **Impact:** Competitive AI surface.
* **Implementation:** Extend `ChatMessage` union (already in `mini-app-types`) + `stream` to emit `StreamChunk` with `toolCall` discriminator; `StreamBuilder.iterate()` yields parsed objects when `contentType`. Host negotiates `ai.tools` capability.
* **Risks:** Tool schema evolution — versioned `ModelCompletionOptions`.
* **Compat:** Existing `chat(messages)` keeps working; new options optional.

#### FUT4 — Cross-mini-app coordination

* **Why:** `emit` `src/client/MiniAppSdk.ts:442` publishes to shell bus; no isolated mini-app→mini-app channel (intentional). Future shells may want scoped coordination (e.g., shared cart).
* **Problem solved:** Controlled inter-mini-app messaging.
* **Impact:** Ecosystem composability.
* **Implementation:** Host-scoped `scope: string` in `HandshakePayload`; `sdk.emit(scope:event)` gated by host `scopes` capability. SDK validates scope locally.
* **Risks:** Privacy — must be host-mediated.
* **Compat:** Host must opt in.

---

### 3.13 Automation, Intelligent Features & Long-Term Value

#### AI1 — Spec-driven codegen

* **Why:** Modules are thin RPC shims `src/modules/*.ts` manually kept in sync with host RPC server — duplication prone.
* **Problem solved:** Contract never drifts.
* **Impact:** Host and SDK ship from one spec.
* **Implementation:** Publish host OpenRPC/JSON Schema spec; generate `src/constants/namespaces.constants.ts`, `src/types/*`, and module shims via `scripts/generate-modules.mjs`. Commit generated output; `biome` still passes.
* **Risks:** Generated code readability — keep templates simple, commit prettier output.
* **Compat:** Generated modules replace hand-written ones without API change.

#### AI2 — Adaptive reliability (circuit breaker + anomaly detection)

* **Why:** `MetricsRecorder` already computes p50/p95/p99 `src/observability/metrics-recorder.ts:39`; unused for decisions.
* **Problem solved:** SDK auto-tunes timeout and pauses hammering a degraded namespace.
* **Impact:** Fewer timeouts, self-healing.
* **Implementation:** `AdaptiveTimeout` plugin reading `metrics` `onSnapshot`; circuit breaker reusing `heartbeat` lost logic `src/rpc/rpc-client.ts:875`. Ship disabled, enable via `reliability: {adaptive: true}`.
* **Risks:** Oscillation — hysteresis and cooldown.
* **Compat:** Plugin, opt-in.

#### AI3 — SDK intelligence: debug assistant

* **Why:** `debug.snapshot()` `src/types/sdk.types.ts:37` is paste-able but requires human interpretation.
* **Problem solved:** Automated diagnosis of “why is locale stale?” (hint missing vs event missing — `APPEARANCE.md:100`).
* **Impact:** Faster resolution.
* **Implementation:** `sdk.debug.diagnose(): Diagnostic[]` checking `capabilities`, `pendingRequests`, `platformType`, `appearance hint` presence, transport `pinnedOrigin`. CLI `npx sewa-sdk diagnose` prints markdown.
* **Risks:** Heuristic noise — limit to high-confidence checks.
* **Compat:** Additive `diagnose()`.

---

## 4. Cross-Cutting Governance

### 4.1 Quality Gates (already present, to harden)

* `biome check --error-on-warnings` `package.json:34` — keep.
* `tsc --noEmit` typecheck — gate PRs.
* `api-extractor run` → `etc/sewa-sdk.api.md` — fail on unreviewed public change.
* `vitest run --coverage` — branch threshold 85, mutation score on `message-validator`.
* `check-size.mjs` 30 kB gzipped budget — fail if growth >2 kB without label `size:approved`.
* Renovate + `check-versions.mjs` for `package.json` / `PROTOCOL_VERSION` / `mini-app-types` drift.

### 4.2 Release & Distribution

* Use `tsup` cjs/esm + `esbuild` IIFE already `package.json:31`; add per-module `exports` for tree-shaking (medium-term).
* Publish `dist/sewa-sdk.d.ts` + `dist/*.map` `src/stream/stream-builder.ts` already stable.
* CDN: add SRI hash to `README.md:67` script tag example; versioned URL `sewa-sdk@1.0.8/sewa-sdk.min.js`.
* Changelog via `changesets` (restore automation removed per `enhancement.md:109`).

---

## 5. Prioritized Roadmap

Roadmap items are **independent** — each lands in its own PR. Priority = impact × risk⁻¹ × compat-cost.

### Short-Term (0–3 months) — Do First

| # | Item | Section | Effort | Why First |
|---|------|---------|--------|-----------|
| S1 | Decompose RpcClient (A1) — pending/heartbeat/stream managers | 3.1 | M | Unblocks every other reliability/perf change; no public API change |
| S2 | Structured error guards + `debug.diagnose()` (OBS1/AI3) | 3.9/3.13 | S | Immediate support ticket relief |
| S3 | `MockHost` + integration harness + compat matrix (T1) | 3.10 | M | Gives confidence for all future PRs |
| S4 | Validation warn in dev (A4) + bounded handler guard (PERF3) | 3.1/3.7 | S | Catches APPEARANCE.md:200 class bugs before prod |
| S5 | TypeDoc + `isSupported` per-action capability (E3, A3) | 3.2/3.11 | S | DX win; host adoption prerequisite for lazy modules |
| S6 | Fix `ai→chat` alias + `http.getStream` return type (E1) | 3.3 | S | Type break visible now; alias prevents breaking |

**Expected outcome:** SDK remains API-compatible but measurably more debuggable, tested, and decomposable.

### Medium-Term (3–9 months)

| # | Item | Section | Effort | Dependency |
|---|------|---------|--------|------------|
| M1 | Formal `SdkPlugin` + interceptor lifecycle (P1/P3) | 3.6 | M | S1 |
| M2 | Lazy modules + per-module exports (`exports["./device"]`) | 3.6 | M | S5, M1 |
| M3 | Request deduplication + `batch` namespace (PERF1/2) | 3.7 | M | S1 |
| M4 | Offline queue plugin (F1) | 3.2 | M | M1, M3 |
| M5 | Transport hardening: origin enforcement, `CustomEvent` opt-in, redaction deep (SEC1/3) | 3.8 | S | S4 |
| M6 | Capability-version map + `protocolVersionRange` (4.5) | 3.4 | S | S3 |
| M7 | Scaffolder + eslint plugin + error catalog (DX2/3) | 3.11 | S | — |

**Expected outcome:** Hosts compose behavior via plugins, bundles shrink per mini app, offline-first becomes feasible.

### Long-Term (9–18 months)

| # | Item | Section | Effort | Dependency |
|---|------|---------|--------|------------|
| L1 | `WebSocket`/`MessagePort` transports + binary `structuredClone` path (FUT1/2) | 3.12 | L | M5, M6 |
| L2 | Spec-driven codegen (AI1) | 3.13 | M | M6 |
| L3 | Adaptive timeout + circuit breaker (REL1/AI2) | 3.7/3.13 | M | S1, M3 |
| L4 | AI tool-use / multimodal streaming (FUT3) | 3.12 | M | L1 |
| L5 | Scoped inter-mini-app bus (FUT4) | 3.12 | M | M1, Host |
| L6 | Worker/SSR transports (F4) | 3.2 | M | M5 |

**Expected outcome:** SDK speaks multiple transports, generates itself from spec, self-tunes reliability — future-proof for WebTransport, Workers, and agentic AI shells.

### Sequencing Rationale

1. **Quick wins + foundation before features:** S1/S3 must precede M1/L3 — you cannot safely add a circuit breaker inside a 1 kLOC class.
2. **DX early unlocks adoption:** S5/S6 make the SDK easier to evaluate, feeding feedback into M-modules.
3. **Security hardening before transport expansion:** M5 before L1 — new sockets inherit the stricter origin boundary.
4. **Spec-driven codegen late:** L2 only after capability-version map settles — generated code should target the v1.1 handshake, not retrofit v1.0.

---

## 6. Appendix

### A. What “No Breaking Change” Means in Practice

| Mechanism | Example | Window |
|-----------|---------|--------|
| Additive field/method | `metrics.durationsWindowMs`, `sdk.chat` alias | Patch/minor, immediate |
| Deprecated alias | `sdk.ai` → `sdk.chat`, `getMiniAppSdk()` → `getInstance()` | 2 minors with `devMode` warning, remove in major |
| Capability gate | `batch`, `binary`, `ai.tools` | Minor, falls back if host omits capability |
| Codemod | `scripts/codemods/ai-to-chat.ts` | Ship with deprecation minor |

No wire field is renamed; `PlatformMessage.channel` `src/constants/protocol.constants.ts:14` and `MESSAGE_CHANNEL` stay frozen for v1.

### B. Risks & Mitigations Summary

| Risk | Trigger | Mitigation |
|------|---------|------------|
| God-object extract causes timer leak | S1 | Characterization tests on `pending`/`streamConsumers` maps |
| Origin pin breaks `*` deployments | M5 | Warn-one-minor then error with remediation link |
| Dedupe hides fresh data | M3 | Short window + allowlist; `dedupe:false` override |
| Generated modules lose readability | L2 | Keep generator templates tiny; commit formatted output |
| Type consolidation requires host publish | A3 | Peer range `^1.0` + re-export shim for one release |

### C. Success Metrics (measure per release)

* **Reliability:** handshake success ≥99.9%, `on(event,resubscribe)` reconnection coverage, timeout rate ↓.
* **Performance:** CDN bundle ≤30 kB gz (enforced `scripts/check-size.mjs`), `p95` request latency via `metrics-recorder` snapshot, deduplication hit rate.
* **Quality:** branch coverage ≥85%, `api-extractor` break rate 0 on minors, open `SdkErrorCode` → typed mapping 100%.
* **Adoption:** `create-sewa-mini-app` weekly downloads, playground sessions, support ticket time-to-resolution.

### D. File Map for Implementers

* Composition root: `src/client/MiniAppSdk.ts:106` / `src/index.ts:153` / `src/cdn.ts:1`
* RPC core to split: `src/rpc/rpc-client.ts:140` / `src/rpc/middleware.ts:34`
* Transport boundary: `src/transport/default-transport.ts:43` / `src/transport/transport.ts:17`
* Protocol: `src/protocol/message.types.ts:32` / `src/protocol/message-validator.ts:47` / `src/protocol/message-factory.ts:22`
* Modules: `src/modules/*.ts` / `src/modules/module-registry.ts:19`
* Observability: `src/observability/metrics-recorder.ts:64` / `src/observability/tracer.ts`
* Constants/types: `src/constants/namespaces.constants.ts:6` / `src/constants/protocol.constants.ts:7` / `src/types/sdk.types.ts:175` / `src/types/common.types.ts:19`
* Build/quality: `package.json:25` / `api-extractor.json:2` / `tsconfig.api.json` / `scripts/*` / `.github/workflows/*`

### E. References

* Prior enhancement backlog (all items now shipped, sequenced in `enhancement.md:702`).
* Appearance delivery contract `APPEARANCE.md:16` (hint via `platform.getType`, fallback hydration, event re-delivery).
* Host wiring notes `APPEARANCE.md:162` (`window.parent.postMessage` bridge, `CustomEvent` channel).

---

*Maintainers: land each roadmap item in its own PR, update this doc’s Status section, and re-run `api-extractor run` before merge. No public API change ships without an updated `etc/sewa-sdk.api.md` and a `MIGRATION.md` entry.*
