# Test Plan — MiniApp SDK

Test framework: **Vitest** with `jsdom` environment.
Config: `vitest.config.ts` matches `src/**/*.test.ts`.

---

## File Structure

```
src/test/
├── errors.test.ts       # SdkError, ErrorCodes
├── transport.test.ts    # SdkTransport lifecycle, SSR, timeouts, retries
├── sdk.test.ts          # MiniAppSdk, factories, singleton, init/destroy
├── utils.test.ts        # generateId, delay, createMessage, isPlatformMessage
├── constants.test.ts    # PROTOCOL_VERSION, PLATFORM_EVENT_NAME, MESSAGE_CHANNEL
├── index.test.ts        # Barrel exports are all accessible
└── cdn.test.ts          # Registry, window.getMiniAppBridge
```

---

## 1. `src/test/errors.test.ts`

### `SdkError` class

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | creates instance from `PlatformError` | `{ code: 'AUTH_FAILED', message: 'denied', retryable: false, details: { userId: '1' } }` | `new SdkError(input)` | `.code === 'AUTH_FAILED'`, `.message === 'denied'`, `.retryable === false`, `.details.userId === '1'` |
| 2 | defaults `retryable` to false when omitted | `{ code: 'ERR', message: 'x' }` | `new SdkError(input)` | `.retryable === false` |
| 3 | defaults `details` to undefined when omitted | `{ code: 'ERR', message: 'x' }` | `new SdkError(input)` | `.details === undefined` |
| 4 | `name` is always `'SdkError'` | any input | `new SdkError(input)` | `.name === 'SdkError'` |
| 5 | `message` matches input | `{ code: 'X', message: 'custom msg' }` | `new SdkError(input)` | `.message === 'custom msg'` |
| 6 | is instance of `Error` | `{ code: 'X', message: 'y' }` | `new SdkError(input)` | `err instanceof Error === true` |

### `SdkError.create()` static

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 7 | returns `SdkError` with correct fields | `ErrorCodes.HANDSHAKE_TIMEOUT, 'timed out', true, { attempt: 3 }` | `SdkError.create(...)` | `.code === 'HANDSHAKE_TIMEOUT'`, `.retryable === true`, `.message === 'timed out'`, `.details.attempt === 3` |
| 8 | `retryable` defaults to false | code + message only | `SdkError.create('X', 'y')` | `.retryable === false` |
| 9 | `details` defaults to undefined | code + message only | `SdkError.create('X', 'y')` | `.details === undefined` |
| 10 | returns `SdkError` instance | any args | `SdkError.create(...)` | `result instanceof SdkError === true` |

### `ErrorCodes` constant

| # | Test | Act | Assert |
|---|------|-----|--------|
| 11 | all error codes exist and are frozen | `Object.keys(ErrorCodes)` | `['HANDSHAKE_TIMEOUT', 'TRANSPORT_STOPPED', 'SDK_NOT_INITIALIZED', 'REQUEST_TIMEOUT', 'REQUEST_FAILED', 'NO_WINDOW']` |
| 12 | each value equals its key | `ErrorCodes.HANDSHAKE_TIMEOUT` | `=== 'HANDSHAKE_TIMEOUT'` (repeat for all 6) |

---

## 2. `src/test/transport.test.ts`

### Instantiation

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | creates with default options | `'mod1', {}` | `new SdkTransport('mod1', {})` | instance created, no throw |
| 2 | creates with custom timeout/retry | `'mod1', { timeout: 5000, retryAttempts: 0, retryDelayMs: 100, targetOrigin: 'https://host.com' }` | `new SdkTransport('mod1', ...)` | instance created, no throw |

### `start()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 3 | does not throw when `window` is undefined (SSR) | delete `globalThis.window` | `transport.start()` | no throw |
| 4 | registers `message` listener on window | `window.addEventListener` spy | `transport.start()` | spy called with `'message'` |
| 5 | registers custom event listener on window | `window.addEventListener` spy | `transport.start()` | spy called with `'gov-platform-event'` |
| 6 | is idempotent — call twice, no duplicate listeners | spy on `addEventListener`, call twice | `transport.start(); transport.start()` | each listener registered exactly once (check listener counts or guard) |
| 7 | restores `window` if undefined after test (cleanup) | delete then restore `window` | `transport.start()` in SSR; restore; `transport.start()` again | second call succeeds |

### `stop()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 8 | removes `message` listener | `window.removeEventListener` spy | `transport.stop()` | spy called with `'message'` |
| 9 | removes custom event listener | `window.removeEventListener` spy | `transport.stop()` | spy called with `'gov-platform-event'` |
| 10 | rejects all pending requests | inject a pending request via private access OR start a request and stop before timeout | `transport.stop()` | all pending promises reject with `SdkError` code `TRANSPORT_STOPPED` |
| 11 | clears pending map | after stop with pending requests | check internal state | `pending.size === 0` |
| 12 | is idempotent — safe to call twice | `transport.stop(); transport.stop()` | no throw |
| 13 | safe to call before `start()` | never call `start()` | `transport.stop()` | no throw, no errors |

### `handshake()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 14 | sends a `handshake` message via `postMessage` | spy on `window.parent.postMessage` | `transport.handshake()` | message with `type: 'handshake'` is posted |
| 15 | resolves when host responds with matching id | inject mock response via `window.dispatchEvent(messageEvent)` with response matching handshake id | `transport.handshake()` | promise resolves |
| 16 | rejects with `SdkError` code `HANDSHAKE_TIMEOUT` on timeout | mock timers; call `handshake()`; advance past timeout | advance timers | promise rejects, `.code === 'HANDSHAKE_TIMEOUT'`, `.retryable === true` |
| 17 | includes `sdkVersion` from `PROTOCOL_VERSION` constant | spy on postMessage | `transport.handshake()` | payload `sdkVersion` matches `PROTOCOL_VERSION` |

### `request()` (with retry)

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 18 | sends `request` message via `postMessage` | spy on `window.parent.postMessage` | `transport.request('auth', 'getUser')` | message with `type: 'request'`, namespace `'auth'`, action `'getUser'` is posted |
| 19 | resolves with payload on successful response | inject matching response | `transport.request('auth', 'getUser')` | resolves with response payload |
| 20 | retries on timeout up to `retryAttempts` times | mock timers; stub `sendRequest` to fail with timeout 3 times then succeed | `transport.request('auth', 'getUser')` | resolves on 4th attempt (1 initial + 3 retries) |
| 21 | throws immediately on non-retryable `SdkError` | stub `sendRequest` to throw `SdkError` with `retryable: false` | `transport.request(...)` | rejects immediately, no retry |
| 22 | uses exponential backoff between retries | mock timers; stub to fail with timeout; spy on `delay` | `transport.request(...)` | delay called with `retryDelayMs * (attempt + 1)` |
| 23 | throws last error after exhausting retries | stub `sendRequest` to always throw timeout | `transport.request(...)` | rejects with `SdkError` code `REQUEST_TIMEOUT` |
| 24 | passes `payload` in sent message | spy on postMessage | `transport.request('auth', 'getUser', { id: '123' })` | `msg.payload === { id: '123' }` |

### `sendMessage()` (private)

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 25 | posts to `window.parent` with configured `targetOrigin` | `targetOrigin: 'https://app.com'`; spy on `postMessage` | trigger a request | `postMessage` called with second arg `'https://app.com'` |
| 26 | defaults targetOrigin to `'*'` | no `targetOrigin` in options | trigger a request | `postMessage` called with second arg `'*'` |
| 27 | throws `SdkError` code `NO_WINDOW` if `window` is undefined (SSR) | delete `globalThis.window` | trigger a request | throws `SdkError` with `.code === 'NO_WINDOW'` |

### `handleIncomingMessage()` (private, tested via events)

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 28 | resolves matching pending request for `response` type | start transport; send a request; dispatch matching response `MessageEvent` | dispatch event | original request promise resolves with payload |
| 29 | ignores message with non-matching `target` | dispatch message with `target === 'other-module'` | no effect on pending |
| 30 | ignores `response` with unknown `id` | dispatch response for id not in pending map | no error, no resolution |
| 31 | invokes event handler for `event` type messages | subscribe via `onEvent`; dispatch event message | handler called with payload |
| 32 | handles error response — rejects with `SdkError` | dispatch response with `error` field | pending request rejects with `SdkError` |

### `onEvent()` / event subscription

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 33 | registers handler for event string | `transport.onEvent('user.login', handler)` | internal handlers set contains `'user.login'` with `handler` |
| 34 | unsubscribe function removes handler | call the returned unsubscribe function | handler removed, no longer invoked on events |
| 35 | multiple handlers for same event all fire | register 2 handlers; dispatch event | both handlers called with same payload |

### `getTraceId()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 36 | returns a non-empty string | new transport | `transport.getTraceId()` | `.length > 0`, `typeof === 'string'` |
| 37 | same instance returns stable id across calls | call twice | `getTraceId()` first === second |

---

## 3. `src/test/sdk.test.ts`

### `MiniAppSdk` constructor

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | sets `moduleId` from options | `new MiniAppSdk({ moduleId: 'my-app' })` | `.moduleId === 'my-app'` |
| 2 | sets `version` to `PROTOCOL_VERSION` | `new MiniAppSdk({ moduleId: 'x' })` | `.version === PROTOCOL_VERSION` |
| 3 | `traceId` is a non-empty string | `new MiniAppSdk({ moduleId: 'x' })` | `.traceId.length > 0` |
| 4 | exposes all 9 module accessors | `new MiniAppSdk({ moduleId: 'x' })` | `.auth`, `.permissions`, `.flags`, `.config`, `.navigation`, `.telemetry`, `.platform`, `.device`, `.http` all exist as objects |
| 5 | validates `moduleId` is required | `new MiniAppSdk({} as any)` | throws or `moduleId` is `undefined` (depending on strictness) |
| 6 | does not call `window` or start transport | spy on `SdkTransport.prototype.start` | constructor does not call `start()` | spy not called |

### `initialize()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 7 | calls `transport.start()` and `transport.handshake()` | spy on transport methods | `await sdk.initialize()` | both spies called |
| 8 | fetches platform type after handshake | mock handshake and request responses | `await sdk.initialize()` | `sdk.platform.type` equals mocked response |
| 9 | is idempotent — second call does nothing | spy; call `initialize()` twice | transport methods called exactly once |
| 10 | throws `SdkError` code `NO_WINDOW` in SSR | delete `globalThis.window` | `await sdk.initialize()` | rejects with `.code === 'NO_WINDOW'` |
| 11 | restores `window` after test (cleanup) | delete then restore; call `initialize()` again | succeeds |

### `destroy()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 12 | calls `transport.stop()` | spy | `sdk.destroy()` | spy called |
| 13 | clears event handlers | register via `on()` then destroy | internal handler map empty |
| 14 | sets initialized to false | initialize then destroy | calling `request` after destroy behaves correctly |
| 15 | is idempotent | call destroy twice | no throw |

### `on()` / event subscription

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 16 | subscribes to event via transport | spy on `transport.onEvent` | `sdk.on('user.login', handler)` | `transport.onEvent` called with `'user.login'` |
| 17 | sends subscribe request to host | spy on `transport.request` | `sdk.on('test.event', handler)` | `transport.request` called with `'event', 'subscribe', { eventType: 'test.event' }` |
| 18 | only sends subscribe once for duplicate events | subscribe twice to same event | `transport.request` called exactly once for subscribe |
| 19 | unsubscribe function removes handler | call unsubscribe | handler no longer fires |
| 20 | multiple handlers for same event all fire | subscribe 2 handlers; dispatch | both called |

### Module accessors

| # | Module | Test | Assert |
|---|--------|------|--------|
| 21 | auth | `auth.getUser()` calls transport with correct namespace/action | `transport.request('auth', 'getUser')` |
| 22 | auth | `auth.isAuthenticated()` | `transport.request('auth', 'isAuthenticated')` |
| 23 | auth | `auth.logout()` | `transport.request('auth', 'logout')` |
| 24 | permissions | `permissions.has('camera')` | `transport.request('permissions', 'has', { permission: 'camera' })` |
| 25 | permissions | `permissions.list()` | `transport.request('permissions', 'list')` |
| 26 | flags | `flags.isEnabled('feature_x')` | `transport.request('flags', 'isEnabled', { flag: 'feature_x' })` |
| 27 | flags | `flags.getAll()` | `transport.request('flags', 'getAll')` |
| 28 | config | `config.get('api_url')` | `transport.request('config', 'get', { key: 'api_url' })` |
| 29 | config | `config.getAll()` | `transport.request('config', 'getAll')` |
| 30 | navigation | `navigation.navigate({ app: 'x', route: '/y' })` | `transport.request('navigation', 'navigate', { app: 'x', route: '/y' })` |
| 31 | navigation | `navigation.getCurrent()` | `transport.request('navigation', 'getCurrent')` |
| 32 | telemetry | `telemetry.log('info', 'msg')` | `transport.request('telemetry', 'log', ...)` — fire-and-forget (`.catch(() => {})`) |
| 33 | telemetry | `telemetry.track('click', { x: 1 })` | `transport.request('telemetry', 'track', ...)` — fire-and-forget |
| 34 | telemetry | `telemetry.error(new Error('fail'))` | `transport.request('telemetry', 'error', ...)` — fire-and-forget |
| 35 | telemetry | `telemetry.error('string error')` | payload `message` is `'string error'` |
| 36 | platform | `.type` getter returns current platformType | default `'WEB'` before init; `'ANDROID'` after mock |
| 37 | platform | `.isWeb()`, `.isAndroid()`, `.isIOS()`, `.isMobile()` | correct booleans based on platform type |
| 38 | device | each device method calls correct namespace/action | `transport.request('device', '<method>', ...)` |
| 39 | device | `device.storage.get/set/remove` | `transport.request('device', 'storage', { action: '<get|set|remove>', ... })` |
| 40 | http | each HTTP method calls `transport.request('http', '<method>', ...)` | correct endpoint, body, headers |

### `createMiniAppSdk()`

| # | Test | Act | Assert |
|---|------|-----|--------|
| 41 | returns a `MiniAppSdk` instance | `createMiniAppSdk({ moduleId: 'x' })` | `instanceof MiniAppSdk` |
| 42 | does NOT initialize | spy on `initialize` | `initialize` not called |
| 43 | returned object has all modules | access `.auth`, `.http`, etc. | all defined |

### `initMiniAppSdk()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 44 | returns a promise resolving to `MiniAppSdk` | | `await initMiniAppSdk({ moduleId: 'x' })` | `instanceof MiniAppSdk` |
| 45 | calls `initialize()` internally | spy | `await initMiniAppSdk(...)` | `initialize` called once |
| 46 | sets global singleton so `getMiniAppSdk()` works | init then call `getMiniAppSdk()` | `getMiniAppSdk()` returns the same instance |
| 47 | destroys previous singleton if called twice | init twice; second call destroys first | first instance's `destroy()` called |
| 48 | after singleton destroyed, `getMiniAppSdk()` throws | destroy old via second init | first instance methods reject properly |

### `getMiniAppSdk()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 49 | returns instance after `initMiniAppSdk()` | init already called | returns `MiniAppSdk` instance |
| 50 | throws `SdkError` code `SDK_NOT_INITIALIZED` before init | never call init | throws with `.code === 'SDK_NOT_INITIALIZED'` |

### Deprecated wrappers (if implemented)

| # | Test | Act | Assert |
|---|------|-----|--------|
| 51 | `initBridge()` calls `initMiniAppSdk()` and emits warning | spy on `console.warn` + `initMiniAppSdk` | warning emitted, `initMiniAppSdk` called |
| 52 | `getPlatformType()` returns platform type | init then call | returns `'WEB'` (or mocked value) |

---

## 4. `src/test/utils.test.ts`

### `generateId()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | returns a string | | `generateId()` | `typeof result === 'string'` |
| 2 | returns non-empty string | | `generateId()` | `result.length > 0` |
| 3 | calls `crypto.randomUUID` when available | mock `crypto.randomUUID` to return `'abc-123'` | `generateId()` | `=== 'abc-123'` |
| 4 | falls back to timestamp+random when `crypto` unavailable | delete `globalThis.crypto` | `generateId()` | matches pattern `/^\d+-[a-z0-9]+$/` |
| 5 | returns unique values across calls | call 10 times | all values are distinct |

### `delay()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 6 | resolves after specified ms | `vi.useFakeTimers()` | `delay(100)`; advance timers | promise resolves after 100ms |
| 7 | returns a `Promise` | | `delay(0)` | `result instanceof Promise` |
| 8 | resolves with no value | | `delay(10)` | resolved value is `undefined` |

### `createMessage()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 9 | returns object with `channel: MESSAGE_CHANNEL` | all required args | `result.channel === 'gov-platform-sdk'` |
| 10 | assigns `id` from `extra.id` if provided | `createMessage(..., { id: 'my-id' })` | `result.id === 'my-id'` |
| 11 | generates `id` via `generateId()` if not provided | spy on `generateId` | `result.id` matches spy return |
| 12 | assigns `type`, `namespace`, `action`, `source`, `target` from args | standard call | all fields match inputs |
| 13 | `version` defaults to `PROTOCOL_VERSION` | no `extra.version` | `result.version === '2.0.0'` |
| 14 | `version` from `extra.version` overrides default | `extra.version: '1.0.0'` | `result.version === '1.0.0'` |
| 15 | `payload` set when provided | payload = `{ foo: 'bar' }` | `result.payload === { foo: 'bar' }` |
| 16 | `payload` is `undefined` when not provided | no payload arg | `result.payload === undefined` |
| 17 | `traceId` defaults to generated id | no `extra.traceId` | typeof string, non-empty |
| 18 | `traceId` from `extra.traceId` overrides | `extra.traceId: 'trace-1'` | `result.traceId === 'trace-1'` |
| 19 | `timestamp` is a number (Date.now()) | freeze `Date.now` at `1000` | `result.timestamp === 1000` |

### `isPlatformMessage()`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 20 | returns `true` for valid PlatformMessage | `{ id: '1', type: 'request', namespace: 'auth', action: 'getUser' }` | `isPlatformMessage(input)` | `true` |
| 21 | returns `false` for `null` | `null` | `false` |
| 22 | returns `false` for `undefined` | `undefined` | `false` |
| 23 | returns `false` for non-object (string) | `'hello'` | `false` |
| 24 | returns `false` for plain object missing `id` | `{ type: 'request', namespace: 'auth', action: 'getUser' }` | `false` |
| 25 | returns `false` when `type` is not a string | `{ id: '1', type: 123, namespace: 'auth', action: 'getUser' }` | `false` |
| 26 | returns `false` when `namespace` is missing | `{ id: '1', type: 'request', action: 'getUser' }` | `false` |
| 27 | returns `false` when `action` is missing | `{ id: '1', type: 'request', namespace: 'auth' }` | `false` |
| 28 | returns `true` with extra fields | valid message + extra fields | `true` |

---

## 5. `src/test/constants.test.ts`

| # | Test | Act | Assert |
|---|------|-----|--------|
| 1 | `PROTOCOL_VERSION` | import | `=== '2.0.0'` |
| 2 | `PLATFORM_EVENT_NAME` | import | `=== 'gov-platform-event'` |
| 3 | `MESSAGE_CHANNEL` | import | `=== 'gov-platform-sdk'` |
| 4 | all are frozen / read-only | attempt reassign | fails (strict mode) or unchanged |

---

## 6. `src/test/index.test.ts`

| # | Test | Act | Assert |
|---|------|-----|--------|
| 1 | exports `MiniAppSdk` | `import { MiniAppSdk } from '../index'` | is a class/function |
| 2 | exports `SdkError` | same | is a class/function |
| 3 | exports `SdkTransport` | same | is a class/function |
| 4 | exports `createMiniAppSdk` | same | `typeof === 'function'` |
| 5 | exports `getMiniAppSdk` | same | `typeof === 'function'` |
| 6 | exports `initMiniAppSdk` | same | `typeof === 'function'` |
| 7 | exports all 6 constants/functions from `constants.ts` | `PROTOCOL_VERSION`, `PLATFORM_EVENT_NAME`, `MESSAGE_CHANNEL` | all defined |
| 8 | exports all 4 utility functions from `utils.ts` | `createMessage`, `generateId`, `delay`, `isPlatformMessage` | all `typeof === 'function'` |
| 9 | exports all 27 type exports | check via `type` | all exported (compile-time check, or use `--dts` test) |

---

## 7. `src/test/cdn.test.ts`

### Registry object

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 1 | `createInstance` creates and initializes SDK | mock `MiniAppSdk.prototype.initialize` to resolve | `registry.createInstance('mod1')` | resolves with `MiniAppSdk` instance, `.moduleId === 'mod1'` |
| 2 | `createInstance` destroys existing instance for same moduleId | create same id twice; spy on `destroy` | `registry.createInstance('mod1')` twice | first instance's `destroy()` called |
| 3 | `createInstance` sets `activeModuleId` | `registry.createInstance('mod1')` | `activeModuleId === 'mod1'` |
| 4 | `getInstance` returns instance for known id | after `createInstance('mod1')` | `registry.getInstance('mod1')` returns instance |
| 5 | `getInstance` returns null for unknown id | never created | `registry.getInstance('ghost')` | `null` |
| 6 | `getActiveInstance` returns active instance | create 2 instances, check | returns last created instance |
| 7 | `getActiveInstance` returns null when no instances | no instances exist | `null` |
| 8 | `destroyInstance` calls `destroy()` on instance | spy on instance | `registry.destroyInstance('mod1')` | `destroy()` called, instance removed from Map |
| 9 | `destroyInstance` updates `activeModuleId` when destroying active | create 2, destroy first | active switches to second |
| 10 | `destroyInstance` sets `activeModuleId` to `null` when last destroyed | create 1, destroy it | `activeModuleId === null` |
| 11 | `hasInstance` returns `true` for existing id | after create | `registry.hasInstance('mod1')` | `true` |
| 12 | `hasInstance` returns `false` for unknown id | | `registry.hasInstance('ghost')` | `false` |
| 13 | `getActiveModuleIds` returns all module id strings | create 3 instances | returns array of 3 strings |

### `window.getMiniAppBridge`

| # | Test | Arrange | Act | Assert |
|---|------|---------|-----|--------|
| 14 | sets `window.getMiniAppBridge` when `window` exists | import cdn module | `(window as any).getMiniAppBridge` is defined |
| 15 | `getMiniAppBridge()` returns registry object | `(window as any).getMiniAppBridge()` | has `createInstance`, `getInstance`, etc. |
| 16 | does not throw when `window` is undefined (SSR) | delete `globalThis.window`; re-import (or test guard) | no error |

---

## Test Execution Order Notes

- **No shared mutable state between test files** — each file imports modules fresh.
- **Transport tests** should mock `window` APIs (`addEventListener`, `removeEventListener`, `parent.postMessage`) using `vi.spyOn`.
- **SDK tests** depend on `MiniAppSdk` and `SdkTransport` — mock transport methods via spy to avoid actual `postMessage`.
- **CDN tests** depend on `MiniAppSdk` — stub `initialize()` to resolve synchronously.

## Vitest Configuration

Already in `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
```

Run with:
```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```
