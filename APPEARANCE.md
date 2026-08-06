# Appearance delivery via `platform.getType`

How locale and theme reach a mini app, and what each host shell owes the SDK.

## The problem

Appearance originally shipped as its own RPC namespace: the SDK called
`appearance.getLocale()` / `appearance.getTheme()` after the handshake, and the
host answered. That works on the web shell, which implements the namespace.

It does not work in the Flutter WebView container, which serves no `appearance`
namespace. The mini app fell back to store defaults (`en` / `system`) and stayed
there — the same mini-app code behaved differently on the two shells.

## The approach

Both shells now attach an appearance hint to the `platform.getType` reply — a
request the SDK is already awaiting during `initialize()`. One code path serves
both, and the mini app is unchanged.

| | web shell | Flutter shell |
|---|---|---|
| `getType` reply | `{ type, appearance: { locale: {…}, theme: {…} } }` | `{ types, appearance: { locale: "en-LK", theme: "dark" } }` |
| initial locale/theme | the hint | the hint |
| runtime changes | `appearance.*` events | `appearance.*` events |
| mini-app code | identical | identical |

### Resolution order

`MiniAppSdk.runInitializeSequence()` resolves appearance in this order:

1. **Hint on `getType`** — used when present, and the `appearance.*` round trips
   are skipped entirely.
2. **`appearance` namespace hydration** — the fallback for hosts built against
   an earlier SDK that don't send a hint. Bounded by
   `APPEARANCE_HYDRATION_BUDGET_MS` (1200ms) so it can never block first paint.
3. **Store defaults** — `en` / `system`, if neither is available.

Event subscription is **not** gated on capabilities, so a shell that delivers
appearance only via the hint still receives runtime changes.

Beyond unifying the two shells, this removes two RPC round trips from web
startup and takes the 1200ms hydration race off the happy path.

## Wire format

### String form — for hosts that only know raw values

```jsonc
{ "type": "flutter", "appearance": { "locale": "en-LK", "theme": "dark" } }
```

`theme` is `"light" | "dark" | "system"`. `locale` is a BCP-47 tag; underscore
separators and odd casing (`EN_lk`) are normalized. Given a string, the SDK
derives `direction` from the language subtag and resolves `"system"` against
`matchMedia`.

### Object form — preferred when the host already computed the values

```jsonc
{
  "type": "web",
  "appearance": {
    "locale": { "locale": "en-LK", "language": "en", "region": "LK", "direction": "ltr" },
    "theme":  { "preference": "system", "mode": "dark" }
  }
}
```

**Host-supplied fields always win.** The SDK only derives `direction` and
resolves `mode` when the host didn't say. A host that knows the answer — the web
shell's `AppearanceController`, or Flutter reading the OS setting — should send
the object form rather than let the SDK guess.

### Accepted variations

- `type` and `types` are both honored.
- A malformed or unrecognized reply leaves the current platform type untouched
  rather than corrupting it.
- A bare `"web"` / `"flutter"` string is still accepted — that is the legacy
  reply shape, and hosts that send it keep working unchanged.

## Runtime changes

The hint is one-shot, consumed during `initialize()`. Every subsequent change
must arrive as an event, on **both** shells:

```jsonc
{
  "type": "event",
  "namespace": "appearance",
  "action": "theme.changed",      // event key is `${namespace}.${action}`
  "payload": { "preference": "light", "mode": "light" }
}
```

Same for `action: "locale.changed"` with a `LocaleState` payload. Bare strings
(`"light"`, `"si-LK"`) are accepted here too.

This is the easiest part of the contract to miss: with the hint in place,
startup looks completely correct while updates silently do nothing.

## SDK changes

### `src/types/common.types.ts`

`AppearanceType` and `PlatformTypeResponse` describe the reply. Each appearance
field accepts a loose string or the full `ThemeState` / `LocaleState`.

### `src/modules/platform.module.ts`

- `applyResponse(raw)` accepts either reply shape and returns
  `{ type, appearance }`. Malformed input falls back to the current type.
- `normalizePlatformResponse(raw, fallbackType)` is exported for direct use.
- `setType` is unchanged.

### `src/modules/appearance.module.ts`

- `normalizeLocale(input)` / `normalizeTheme(input, fallbackMode)` coerce string
  form, object form, and `{locale: …}` / `{theme: …}` event wrappers into full
  state. They return `null` on unusable input so bad data cannot overwrite good
  state.
- `applyHint(hint)` seeds the store from a `getType` hint.
- `getLocale()` / `getTheme()` serve the store when the host hasn't negotiated
  the `appearance` namespace, so those calls don't reject on Flutter.

### `src/client/MiniAppSdk.ts`

- `getType` is requested as `PlatformTypeLiteral | PlatformTypeResponse`.
- Appearance event subscription moved out of the capability check.
- `hydrateAppearance()` is now the fallback rather than the primary path.

## Host requirements

### Web shell (`sewa-poc`)

`packages/host-platform/src/rpc/rpc-server.ts` — the `platform.getType` handler
returns `{ type, appearance }`, reading from `services.appearance`. The lookup
is wrapped in `try`/`catch`: `getType` gates the mini app's entire startup, so a
failed appearance read degrades to `{ type }` rather than failing the request.

The `appearance` namespace stays registered and advertised — it remains the
fallback for mini apps running an older SDK bundle, and serves explicit
`sdk.appearance.getLocale()` calls.

### Flutter shell

1. Inject `window.__GSA_HOST_DESCRIPTOR__`, then load `sewa-sdk.min.js` and call
   `window.getMiniAppBridge().createInstance({ miniAppId })` — that sets
   `window.__GSA_SDK__`, which the mini app reads.
2. Answer the handshake with an explicit `capabilities` list that **omits**
   `appearance`. If the field is absent entirely the SDK assumes full support,
   and an explicit `sdk.appearance.getLocale()` would then fire an RPC Flutter
   can't serve.
3. Answer `platform.getType` with `{ type: "flutter", appearance: {…} }`.
4. Emit `appearance.locale.changed` / `appearance.theme.changed` on every change.

Protocol version is matched on **major only**; the SDK is on `1.0.0`.

#### Transport wiring

The SDK sends via `window.parent.postMessage(...)`. When the mini app is the
top-level document in a WebView, `window.parent === window`, so messages post
back to the same window and never reach Dart. Bridge them:

```js
window.addEventListener('message', (e) => {
  if (e.data && e.data.channel === 'gov-platform-sdk') {
    FlutterBridge.postMessage(JSON.stringify(e.data));
  }
});
```

Inbound, use the `CustomEvent` channel — it exists for this case and skips the
origin checks that apply to the `message` path:

```js
window.dispatchEvent(new CustomEvent('gov-platform-event', { detail: message }));
```

## Mini-app impact

None. `sdk.appearance.state()` and `sdk.appearance.subscribe()` keep the same
signatures and the same `AppearanceState` shape.

## Testing Flutter parity on the web shell

To prove the hint path works alone, drop `'appearance'` from
`HOST_EXTRA_CAPABILITIES` in `rpc-server.ts`. `isMethodAllowed()` then rejects
`appearance.*` requests, exactly as the Flutter shell does.

Keep the events. `broadcastToModules()` gates on `eventSubscriptions`, not
capabilities, so they still flow — which is correct, since runtime changes must
work on both shells. Removing them would make the hint approach look broken when
the actual gap is the part Flutter still has to implement.

Restore the capability before merging.

## Debugging

Inbound messages are validated by `protocol/message-validator.ts` and **invalid
ones are dropped silently** — no error, no log, the request just times out.
Check these first:

- `timestamp` must be a JSON **number**, not a string.
- `requestId` must echo the request's id exactly.
- `channel`, `requestId`, `type`, `namespace`, `action`, `source`, `target`,
  `gsaProtocolVersion`, `traceId` must all be non-empty strings.
- On the `CustomEvent` channel, `detail` must be the message object, not a JSON
  string.

Startup correct but updates dead means the hint works and the events are
missing.

## Follow-ups

- `PlatformTypeResponse` / `AppearanceType` are a wire contract between the SDK
  and the host, so they belong in `@lizuz/mini-app-types` once the shape has
  settled against a real Flutter container. They are local to this repo for now
  to avoid blocking on a publish.
- `src/types/common.types.ts` and `src/types/platform.types.ts` shadow
  definitions of the same names in `@lizuz/mini-app-types`. `platform.module.ts`
  imports the local ones while `MiniAppSdk.ts` imports the package ones; this
  compiles only because the definitions are currently identical. Worth
  consolidating when the types above are promoted.
