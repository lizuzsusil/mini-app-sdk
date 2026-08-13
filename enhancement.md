# Enhancement Roadmap

A curated list of enhancements and nice-to-have features for the mini-app SDK,
grouped by theme and ordered by impact. Each item references the code it
touches so it can be scoped and implemented independently.

Legend:

- **P0** — high impact, low risk; do first.
- **P1** — valuable, moderate effort.
- **P2** — nice to have; schedule around.

---

## Status

Implemented:

- **2.2 Debug snapshot** — `sdk.debug.snapshot()` returning a serializable view
  of the instance (`src/client/MiniAppSdk.ts`, `src/rpc/rpc-client.ts`).
- **2.3 Dev-mode capability warnings** — `MiniAppSdkOptions.devMode` plus a
  one-per-`namespace.action` warning when a request targets a domain namespace
  the host didn't negotiate (`src/rpc/rpc-client.ts`).
- **3.1 Storage: JSON values, TTL, scoped keys** — `getJson`/`setJson`,
  `ttlMs` option, and `scoped(prefix)` (`src/modules/storage.module.ts`).
- **4.2 CI pipeline** — `.github/workflows/ci.yml` (checks) and
  `publish.yml` (tag-triggered npm publish).

Side fixes made while landing 4.2 (a green pipeline needs a green suite):

- Pre-existing test bugs: stale `protocolVersion` constants in
  `src/rpc/rpc-client.test.ts` and a wrong action key in
  `src/observability/metrics-recorder.test.ts`.
- `pnpm-lock.yaml` re-synced (removed `release-please`, which had already been
  dropped from `package.json`).

---

## 1. Runtime reliability

### 1.1 Request cancellation via `AbortSignal`

**P1**

The SDK enforces a timeout on every request (`rpc/rpc-client.ts`, `sendRequest`)
but gives callers no way to cancel a request eagerly. When a mini app unmounts,
navigates away, or a user dismisses a screen, the pending request keeps
occupying the pending-request map and its timer until the timeout fires.

**Proposed shape**

- Thread an optional `AbortSignal` through `RpcClient.request()` /
  `sendRequest()` and `executeWithRetry()`.
- On abort: reject the pending request with a cancellable error (e.g. reuse
  `REQUEST_CANCELLED` code from `errors/sdk-error.ts`), clear the timer, and
  delete it from the pending map.
- `RpcClient.stop()` already rejects in-flight requests with
  `REQUEST_CANCELLED`-style `ProtocolError`s — the abort path should mirror
  that flow exactly.
- Expose per-module: `auth.getUser({ signal })`, `device.location({ signal })`,
  and so on. Adding `signal` to the per-module options types (e.g.
  `DeviceExtraOptions`) is optional; a `sdk.request(namespace, action, payload,
  { signal })` escape hatch covers the rest.

**Files**

- `src/rpc/rpc-client.ts`
- `src/types/sdk.types.ts` / per-module option types
- `src/errors/sdk-error.ts` (reuse existing code)

**Payoff**

Mini app unmount and navigation stop leaking in-flight work; the pending map
stays clean, and memory/timer churn drops.

---

### 1.2 Reconnection & heartbeat

**P1**

The SDK performs one handshake at `initialize()` and never re-establishes a
connection if the host restarts or the transport drops (e.g. the shell iframe
reloads, the WebView bridge is torn down). Both sides have no way to detect a
dead peer.

**Proposed shape**

- **Heartbeat:** optional ping/pong on a fixed interval (e.g. every 30s) once
  `initialize()` resolves. A `handshake`-style message with a new
  `heartbeat.ping` action answered by `heartbeat.pong`. N consecutive missed
  pongs emit a `connection.lost` event to mini apps and trigger a reconnect
  attempt.
- **Reconnect:** on detection of a dead peer (or on transport restart), retry
  the handshake sequence with backoff (reuse `utils/backoff.ts`). Emit
  `connection.established` / `connection.lost` so mini apps can reconcile
  state (re-fetch config/flags, re-subscribe to events).
- Respect the existing capability negotiation — the reconnect should re-run
  `handshake()` and re-negotiate capabilities rather than assume them.
- Keep it opt-in via `MiniAppSdkOptions` (e.g. `heartbeat: { intervalMs,
  timeoutMs, maxMissedPongs }`).

**Files**

- `src/rpc/rpc-client.ts` (handshake/reconnect logic)
- `src/constants/namespaces.constants.ts` (heartbeat actions)
- `src/types/sdk.types.ts` (options)

**Payoff**

Mini apps survive host reloads/restarts and can recover state instead of
hanging on a silently dead shell.

---

### 1.3 Event replay buffer

**P2**

Events emitted by the host between handshake completion and a mini app's first
`on()` subscription are dropped. `RpcClient.onEvent` sends `event.subscribe` on
the first handler, but anything the host pushed before that is lost — relevant
for appearance, config, and navigation events on a slow mount.

**Proposed shape**

- Request a short bounded replay from the host: include a flag or a "since
  timestamp" in the `event.subscribe` payload so the host can re-deliver recent
  events.
- Alternatively maintain a small client-side buffer keyed by event name that
  stores the last N payloads per event; new subscribers receive the buffered
  value immediately. A `subscribe(..., { replay: true })` option controls it.
- Keep the buffer size bounded and documented.

**Files**

- `src/rpc/rpc-client.ts` (`onEvent`)
- `src/constants/namespaces.constants.ts` (`EVENT.SUBSCRIBE` payload shape)

**Payoff**

No lost events on slow mounts; subscriptions can be "value + change" rather
than "change only".

---

### 1.4 Typed events

**P2**

`sdk.on(event: string, handler: EventHandler)` and `sdk.emit(event: string)` in
`src/client/MiniAppSdk.ts` take raw strings and `unknown` payloads. Misspelled
event names fail silently.

**Proposed shape**

- Introduce a typed event map, e.g.:

  ```ts
  interface SdkEventMap {
    'appearance.theme.changed': ThemeState;
    'appearance.locale.changed': LocaleState;
    'navigation.back.requested': void;
    'config.changed': ConfigChangedEvent;
  }
  ```

- Overload `on<K extends keyof SdkEventMap>(event: K, handler: (payload:
  SdkEventMap[K]) => void)` while keeping the `string` fallback so host-defined
  events remain usable. Same for `emit`.
- Keep the unknown-typed overload so the SDK doesn't hard-fail on events it
  doesn't know about — the typed map is a compile-time convenience, not a
  runtime filter.

**Files**

- `src/client/MiniAppSdk.ts`
- `src/types/common.types.ts` (event map)
- `src/constants/namespaces.constants.ts` (existing `NAVIGATION_EVENTS`)

**Payoff**

Compile-time safety for known events; no runtime behavior change.

---

## 2. Observability & DX

### 2.1 Metrics: percentiles, windowing, and export hooks

**P1**

`MetricsRecorder` (`src/observability/metrics-recorder.ts`) tracks counts,
success/failure/timeout/retry totals, and average duration per
`namespace.action` — but no distribution, so a 50ms p50 with a 9s p99 is
invisible. Data accumulates forever (unbounded), and there's no hook to ship it
off-instance.

**Proposed shape**

- **Percentiles:** keep a small bounded ring buffer of recent durations per
  action and compute p50/p95/p99 from it; add them to `ActionMetrics` /
  `RpcMetricsSnapshot`.
- **Windowing:** optional max age / max entries per action; drop or fold old
  entries so long-running mini apps don't grow unbounded.
- **Export hook:** `onSnapshot` callback or an event emitted on each snapshot so
  a host can persist metrics without polling `sdk.getMetrics()`.
- Keep `getMetrics()` backward compatible — additive fields only.

**Files**

- `src/observability/metrics-recorder.ts`
- `src/observability/metrics.types.ts`
- `src/rpc/rpc-client.ts` (wiring the hook)

**Payoff**

Real latency visibility (p99 outliers), bounded memory, and a push-based path
for telemetry without a polling loop.

---

### 2.2 Debug snapshot

**P1**

When a mini app or host files a support ticket, there's no single artifact that
shows "what was the SDK doing". Today that information is scattered across the
logger and `getMetrics()`.

**Proposed shape**

- Add `sdk.debug.snapshot()` returning a serializable object:

  ```ts
  {
    sdkVersion, protocolVersion, miniAppId, traceId,
    platformType, capabilities,
    status: 'initializing' | 'ready' | 'destroyed',
    transport: { pinnedOrigin, started },
    metrics: RpcMetricsSnapshot,
    pendingRequests: [{ namespace, action, id, elapsedMs }],
    registeredModules: string[],
  }
  ```

- The `pendingRequests` view needs a small read-only accessor on `RpcClient`
  (currently the pending map is private).
- Wire the loggers to accept `minLevel` from `MiniAppSdkOptions` so a debug
  build can be turned up without a code change.

**Files**

- `src/client/MiniAppSdk.ts`
- `src/rpc/rpc-client.ts` (pending-request accessor)
- `src/types/sdk.types.ts`

**Payoff**

One paste-able blob for support/debugging; also useful as a dev-tools panel.

---

### 2.3 Dev-mode capability warnings

**P2**

Calling a module whose namespace the host didn't negotiate fails only at
request time with a `ProtocolError`. In development, that should be loud and
immediate.

**Proposed shape**

- After `initialize()`, if a module's namespace is missing from
  `this.capabilities` and the request is attempted, log a prominent warning
  (once per `namespace.action`) naming the missing capability.
- Gate on a dev flag (`import.meta.env.DEV` / `NODE_ENV !== 'production'`, or
  an explicit `devMode` option) so production logs stay quiet.
- Implement in `RpcClient.request()` or as a default-first middleware so every
  module gets it for free.

**Files**

- `src/rpc/rpc-client.ts` or `src/rpc/middleware.ts`
- `src/types/sdk.types.ts` (dev flag in options)

**Payoff**

Feature-detection mistakes surface during development instead of in prod.

---

### 2.4 Logging: redaction and level from options

**P2**

The `ConsoleLogger` (`src/logging/console-logger.ts`) logs context verbatim, so
sensitive payloads (auth tokens, user PII in `auth.getUser` replies) can leak
to console. Logging is also opt-in only via the constructor dependencies — not
available through `MiniAppSdkOptions`.

**Proposed shape**

- Add a `redact` option to `ConsoleLogger` (a `Set<string>` of keys or a
  predicate) that masks matching fields in `context` before writing.
- Add `logLevel` to `MiniAppSdkOptions` so a vendor can enable
  `ConsoleLogger({ minLevel })` without a custom transport/dependency wiring.
- Consider a `logger` factory option that already exists in
  `MiniAppSdkDependencies` — this is about surfacing it through the public
  options type.

**Files**

- `src/logging/console-logger.ts`
- `src/types/sdk.types.ts`
- `src/client/MiniAppSdk.ts`

**Payoff**

Safer default logging; easier on-boarding for debugging.

---

### 2.5 Pluggable tracing

**P2**

The SDK carries one `traceId` per instance (`rpc/rpc-client.ts`), stamped on
every message. There's no way to attach a per-request span context or bridge
into an existing tracer (OpenTelemetry, etc.).

**Proposed shape**

- Define a minimal `Tracer` interface (`startSpan(name, context) => Span` with
  `end()`, `setAttribute()`, and a hook to attach span context to outbound
  message `traceId`).
- Accept an optional `tracer` in `MiniAppSdkDependencies`; default to a
  no-op. RPC events (request started, response received, timeout, retry,
  middleware errors) feed the tracer.
- Keep it additive — no behavior change when no tracer is supplied.

**Files**

- `src/observability/` (new `tracer.ts`, `tracer.types.ts`)
- `src/rpc/rpc-client.ts`

**Payoff**

End-to-end tracing across host ↔ mini app for debugging latency in production.

---

## 3. Module & API enhancements

### 3.1 Storage: JSON values, TTL, scoped keys

**P1**

`StorageSdkModule` (`src/modules/storage.module.ts`) stores only `string`
values under flat keys. Mini apps that want structured state or session-scoped
data hand-roll serialization and key namespacing.

**Proposed shape**

- **Typed get/set:** `get<T = string>(key)` / `set(key, value: unknown)` with
  an internal `JSON.stringify`/`parse`; a `raw` flag preserves the current
  string-only behavior.
- **TTL:** `set(key, value, { ttlMs })` — host answers with an expiry; `get`
  returns `null` past expiry (host-side concern, or SDK-side check if the host
  reports `expiresAt`).
- **Scoped keys:** a `StorageSdkModule.scoped(prefix)` factory returning a
  sub-module that namespaces keys (`prefix:key`) to avoid collisions between
  mini-app features.
- Backward compatible: existing `get`/`set`/`remove` signatures keep working.

**Files**

- `src/modules/storage.module.ts`
- `src/types/storage.types.ts` (if types are local) / `@lizuz/mini-app-types`
- `src/constants/namespaces.constants.ts` (payload fields)

**Payoff**

Less boilerplate in mini apps; safer multi-feature storage.

---

### 3.2 Feature-detect guards for device APIs

**P2**

`device.*` calls (`src/modules/device.module.ts`) all go straight to the host
and fail at request time if the host doesn't implement them. Capabilities are
namespace-granular only, so a mini app can't tell whether `biometric` or
`location` is actually available before calling.

**Proposed shape**

- Add a `supported(action)` / `isSupported(action)` helper to the device module
  (and optionally to every module) that consults the negotiated capabilities
  **and** an optional per-action capability string the host reports.
- Mini apps then branch: `if (sdk.device.isSupported('biometric')) { … }`
  instead of try/catch on every call.
- If the host protocol can't advertise per-action capabilities, this is a thin
  wrapper over the namespace list as a first step.

**Files**

- `src/modules/device.module.ts`
- `src/types/sdk.types.ts` (`capabilities` shape)

**Payoff**

Graceful feature degradation; fewer surprising `ProtocolError`s.

---

### 3.3 AI chat polish

**P2**

The chat module (`src/modules/chat.module.ts`) streams via `sendStreamRequest`
and hands back a `StreamBuilder` (`src/stream/stream-builder.ts`), but offers
no way to cancel a stream, no progress signal, and no helpers around token
accounting.

**Proposed shape**

- **Cancellation:** a `cancel()` on `StreamBuilder` that sends a
  `ai.cancel`/`stream.cancel` request to the host and rejects the builder.
  Tie it into a `signal` option on `chat()` for ergonomics.
- **Stream state:** expose `receivedBytes` / `receivedChunks` and a `total`
  when the host sends `streamTotal` (the builder already stores it on chunks).
- **History helpers:** a small `ChatMessage[]` builder/assistant so mini apps
  stop hand-assembling message arrays.
- Keep `StreamBuilder` transport-agnostic; cancellation semantics belong to the
  RPC layer.

**Files**

- `src/stream/stream-builder.ts`
- `src/rpc/rpc-client.ts` (`sendStreamRequest`)
- `src/modules/chat.module.ts`
- `src/constants/namespaces.constants.ts` (cancel action)

**Payoff**

Better UX for long generations; usable progress and stop controls.

---

### 3.4 HTTP: typed errors, streaming, upload progress

**P2**

`HttpSdkModule` (`src/modules/http.module.ts`) proxies all verbs but returns
`HttpResult` raw. Error handling and large-body cases are left to the mini app.

**Proposed shape**

- **Typed errors:** map host-side HTTP error payloads to `SdkError` subclasses
  (status 4xx → `HttpClientError`, 5xx → `HttpServerError`, network →
  `SdkError`) with `status` and `retryable` fields, so `5xx` retries reuse the
  existing retry machinery.
- **Streaming:** an optional `getStream`/`stream` variant routed through
  `sendStreamRequest` for large downloads/SSE.
- **Upload progress:** optional `onProgress` in params when the host supports
  progress callbacks (or mirror it as events).

**Files**

- `src/modules/http.module.ts`
- `src/errors/` (new error subclasses)
- `src/rpc/rpc-client.ts` (streaming reuse)

**Payoff**

Consistent error handling and support for large/streamed payloads.

---

### 3.5 Push notifications & deep links (optional modules)

**P2**

Not currently represented in the namespace list. If the host protocol should
support them:

- **Notifications:** subscribe for push token delivery (`notifications.token`,
  `notifications.opened` events), register listeners, request permission.
- **Deep links:** `sdk.links.open(url, { inApp })` and a `links.opened` event
  for host-resolved deep links into the mini app.

Gate both on capability negotiation and add them as first-class modules
mirroring `device.module.ts` so they inherit retry/timeout/middleware for free.

**Files**

- New `src/modules/notifications.module.ts` / `src/modules/links.module.ts`
- `src/constants/namespaces.constants.ts`
- `src/client/MiniAppSdk.ts` (registration)

**Payoff**

Covers two common mini-app integration needs without forking the SDK.

---

## 4. Engineering quality

### 4.1 Breaking-change detection (API extractor)

**P1**

This is a published SDK (`@lizuz/sewa-sdk`); a type change that compiles
locally can still break consumers. There's no automated check.

**Proposed shape**

- Adopt `@microsoft/api-extractor` (or `api-check`/`tsc -b` report) to emit a
  `.api.md` report and fail the build on public-API changes that aren't
  deliberate.
- Wire into `pnpm build` / CI with a `--local` comparison against the committed
  report.

**Files**

- `package.json` (script + devDependency)
- New `etc/` report file

**Payoff**

No accidental breaking changes slip into a release.

---

### 4.2 CI pipeline

**P1**

The repo has no `.github/` — no automated lint, typecheck, test, build, or
publish. Every check runs only on a developer's machine.

**Proposed shape**

- GitHub Actions workflow:
  1. `pnpm install` (frozen lockfile)
  2. `pnpm typecheck`
  3. `pnpm lint`
  4. `pnpm test`
  5. `pnpm build`
  6. On tag (`v*`): `pnpm publish` (or continue with the release-please setup
     referenced in git history).
- Optionally gate the publish step on the api-extractor check from 4.1.

**Files**

- New `.github/workflows/ci.yml` (+ `release.yml`)

**Payoff**

Every PR is verified; releases are reproducible.

---

### 4.3 Bundle size budget for the CDN build

**P2**

The CDN IIFE (`src/cdn.ts` → `dist/sewa-sdk.min.js`) ships to every host tab;
size regressions are invisible. No CI gate exists.

**Proposed shape**

- Add a size-budget script (e.g. `size-limit` or a tiny custom check) that fails
  if `sewa-sdk.min.js` grows past a threshold (say 25–30 kB gzipped, measured
  from current).
- Log a delta in CI output so contributors see the impact of a change.

**Files**

- `package.json` (script)
- CI workflow step

**Payoff**

Keeps the injected bundle lean over time.

---

### 4.4 Source maps in `dist`

**P2**

`dist` ships minified/transpiled bundles with no source maps, so production
stack traces from the CDN build are near-unreadable.

**Proposed shape**

- Enable `sourcemap: true` in `tsup`/`esbuild` configs.
- Publish the maps (they're small) and reference them from the bundles; keep
  sources inline or alongside.

**Files**

- `package.json` (`build:lib`, `build:cdn`)

**Payoff**

Debuggable production errors without a separate build chore.

---

## Suggested sequencing

1. **Quick wins (P0/P1, low risk):** 2.2 debug snapshot, 2.3 dev warnings,
   3.1 storage typed values, 4.2 CI.
2. **Core reliability (P1):** 1.1 AbortSignal, 1.2 heartbeat/reconnect.
3. **Observability depth (P1):** 2.1 metrics percentiles + hooks, 2.4 log
   redaction, 4.1 api-extractor.
4. **Feature work (P1/P2):** 3.3 AI chat, 3.2 feature-detect guards, 1.3 event
   replay, 1.4 typed events.
5. **Stretch (P2):** 3.4 HTTP polish, 3.5 notifications/links, 2.5 tracing,
   4.3 size budget, 4.4 source maps.

Items are intentionally independent — each can be landed in its own PR without
touching the others.
