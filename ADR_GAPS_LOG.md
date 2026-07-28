# ADR Gaps — Log of Fixes

## 10 Gaps Identified Between ADR Specs & Codebase

| # | Gap | Status |
|---|-----|--------|
| 1 | `window.__GSA_SDK__` vs `getMiniAppBridge()` — conflicting bridge access patterns | 🔵 Discussed — multi-instance concern, left unresolved |
| 2 | `http` module should be renamed `api` with single `request()` method | ✅ Fixed |
| 3 | `storage` should be a top-level SDK module, not nested under `device` | ✅ Fixed |
| 4 | `PlatformTypeLiteral` uses `'android'\|'ios'\|'web'` but ADR says `'flutter'\|'web'` | ✅ Fixed |
| 5 | Wire format field `version` should be `gsaProtocolVersion` | ✅ Fixed |
| 6 | Wire format field `moduleId` should be `miniAppId` | ✅ Fixed |
| 7 | `namespace` + `action` should merge into single `capability` on the wire | ❌ Reverted — user wants separate `namespace` + `action` |
| 8 | Missing `emit()` method for publishing events to the shell | ✅ Fixed |
| 9 | Missing host descriptor injection (`window.__GSA_HOST_DESCRIPTOR__`) | ✅ Fixed |
| 10 | `PlatformMessage.id` should be `requestId` | ✅ Fixed |

---

## Gap 1 — `window.__GSA_SDK__` vs `getMiniAppBridge()`

**Issue:** The ADR defines `window.__GSA_SDK__` as the single bridge entry point, but the codebase exposes a `getMiniAppBridge()` factory. A global singleton (`__GSA_SDK__`) cannot support multiple mini-app instances in the same document because they'd share state.

**Analysis:**
- **Flutter host** — one WebView loads one mini-app at a time. Global singleton is safe.
- **Web host (multi-tab)** — each tab is an isolated JS realm. Global singleton per tab is safe.
- **Web host (same document, concurrent)** — unsafe. Only scenario where multiple instances coexist in the same `window`.

**Solution:** Added `registerGlobal?: boolean` to `MiniAppSdkOptions`. When enabled, the SDK assigns `this` to `window.__GSA_SDK__` and deletes it on `destroy()`. The reference is non-reassignable (via `Object.defineProperty` — see note below). The factory `getMiniAppBridge()` remains the primary API; the global is a convenience for one-mini-app-per-tab shells.

```ts
// Flutter shell — safe, one mini-app at a time
const sdk = getMiniAppBridge({ miniAppId: 'aadhaar', registerGlobal: true });

// Web shell, multi-tab — safe, each tab gets its own window
const sdk = getMiniAppBridge({ miniAppId: 'pan', registerGlobal: true });
// shell reads from window.__GSA_SDK__ as needed

// Web shell, same-document concurrent — DON'T use registerGlobal
const sdk1 = getMiniAppBridge({ miniAppId: 'tab-a' }); // no global
const sdk2 = getMiniAppBridge({ miniAppId: 'tab-b' }); // no global
```

**Files modified:**
- `src/constants/protocol.constants.ts` — added `SDK_GLOBAL_KEY = '__GSA_SDK__'`
- `src/constants/index.ts` — re-exported `SDK_GLOBAL_KEY`
- `src/types/sdk.types.ts` — added `registerGlobal?: boolean` to `MiniAppSdkOptions`
- `src/client/MiniAppSdk.ts` — assigns `this` to `globalThis.__GSA_SDK__` in constructor if `registerGlobal` is true; deletes it in `destroy()`

---

## Gap 2 — Rename `http` → `api` module

**Change:** Replaced `http.module.ts`/`http.types.ts` with `api.module.ts`/`api.types.ts`. Single `request()` method per ADR.

**Type design:**
```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ApiRequestParams<TBody = unknown> = {
  method?: 'POST';
  body: { method: 'POST'; path: string } & TBody;
  headers?: Record<string, string>;
} | {
  method?: Exclude<HttpMethod, 'POST'>;
  body?: TBody;
  headers?: Record<string, string>;
};
```

**Files created:**
- `src/modules/api.module.ts`
- `src/types/api.types.ts`

**Files deleted:**
- `src/modules/http.module.ts`
- `src/types/http.types.ts`

**Files modified:**
- `src/client/MiniAppSdk.ts` — property `http` → `api`, import/registration updates
- `src/client/MiniAppSdk.test.ts` — `sdk.http` → `sdk.api`
- `src/types/sdk.types.ts` — `HttpSdkModule` → `ApiSdkModule`
- `src/types/index.ts` — barrel exports
- `src/modules/index.ts` — barrel exports
- `src/index.ts` — barrel exports
- `src/constants/namespaces.constants.ts` — `NAMESPACES.HTTP` → `NAMESPACES.API`
- `src/observability/metrics-recorder.test.ts` — test assertion updated

---

## Gap 3 — Extract `storage` from `device` into standalone module

**Change:** Moved storage methods (`get`, `set`, `remove`) from `device.storage` sub-module into a top-level `sdk.storage` module. Removed `DeviceStorageModule` interface.

**Files created:**
- `src/modules/storage.module.ts`
- `src/types/storage.types.ts`

**Files modified:**
- `src/modules/device.module.ts` — removed storage sub-module, `StorageRpcResult`, and `ACTIONS.DEVICE.STORAGE` calls
- `src/types/device.types.ts` — removed `DeviceStorageModule` interface and `storage` property from `DeviceSdkModule`
- `src/types/index.ts` — added `StorageSdkModule` export, removed `DeviceStorageModule`
- `src/modules/index.ts` — added `createStorageModule` export
- `src/client/MiniAppSdk.ts` — added `storage: StorageSdkModule` property, registered module
- `src/types/sdk.types.ts` — added `storage` to `MiniAppSdkInterface`
- `src/constants/namespaces.constants.ts` — added `NAMESPACES.STORAGE` + `ACTIONS.STORAGE.{GET,SET,REMOVE}`; removed `STORAGE` from `ACTIONS.DEVICE`

---

## Gap 4 — `PlatformTypeLiteral` → `'flutter' | 'web'`

**Change:** Simplified platform type from 3 values (`android|ios|web`) to 2 (`flutter|web`). Updated `ModuleFactory` signature to remove second generic param.

**Files modified:**
- `src/types/common.types.ts` — `PlatformTypeLiteral` changed to `'flutter' | 'web'`
- `src/types/platform.types.ts` — `getPlatformType()` returns `Promise<PlatformTypeLiteral>`; `ModuleFactory<T>` simplified
- `src/modules/platform.module.ts` — simplified `createPlatformModule`, removed unused imports
- `src/client/MiniAppSdk.ts` — removed `hostModules` param from registry `register` calls
- `src/client/MiniAppSdk.test.ts` — updated test calls
- `src/types/index.ts` — updated barrel export

---

## Gap 5 — Wire field `version` → `gsaProtocolVersion`

**Change:** Renamed the protocol version field in `PlatformMessage` and all related types/variables.

**Files modified:**
- `src/protocol/message.types.ts` — `version` → `gsaProtocolVersion`
- `src/protocol/message-factory.ts`
- `src/protocol/message-validator.ts`
- `src/rpc/rpc-client.ts`
- `src/rpc/rpc-client.test.ts`
- `src/client/MiniAppSdk.ts`
- `src/constants/protocol.constants.ts`
- `src/cdn.ts`

---

## Gap 6 — Wire field `moduleId` → `miniAppId`

**Change:** Renamed all occurrences across interfaces, classes, constants, and tests.

**Files modified:**
- `src/protocol/message.types.ts`
- `src/protocol/message-factory.ts`
- `src/protocol/message-validator.ts`
- `src/rpc/rpc-client.ts`
- `src/rpc/rpc-client.test.ts`
- `src/client/MiniAppSdk.ts`
- `src/client/MiniAppSdk.test.ts`
- `src/types/sdk.types.ts`
- `src/cdn.ts`

---

## Gap 7 — `namespace` + `action` → single `capability` (Reverted)

**Change:** Was implemented but **reverted** per user request. The wire format keeps separate `namespace` and `action` fields.

---

## Gap 8 — Add `emit()` method

**Change:** Added `emit(event, data?)` to `MiniAppSdkInterface` and `MiniAppSdk` for fire-and-forget event publishing to the shell.

**Files modified:**
- `src/types/sdk.types.ts` — added `emit()` to interface
- `src/client/MiniAppSdk.ts` — implemented `emit()` via RPC `event.emit`
- `src/constants/namespaces.constants.ts` — added `EMIT: 'emit'` to `ACTIONS.EVENT`

---

## Gap 9 — Host descriptor injection

**Change:** SDK reads `window.__GSA_HOST_DESCRIPTOR__` at construction. Exposed as `sdk.hostDescriptor`.

**Files modified:**
- `src/types/platform.types.ts` — added `HostDescriptor` interface
- `src/constants/protocol.constants.ts` — added `HOST_DESCRIPTOR_GLOBAL_KEY`
- `src/client/MiniAppSdk.ts` — reads descriptor from global, exposes as property
- `src/index.ts` — exports `HostDescriptor`

---

## Gap 10 — `PlatformMessage.id` → `requestId`

**Change:** Renamed envelope field `id` to `requestId`. Payload data fields (e.g. `{ id: 'user-1' }`) left untouched.

**Files modified:**
- `src/protocol/message.types.ts`
- `src/protocol/message-factory.ts`
- `src/protocol/message-validator.ts`
- `src/rpc/rpc-client.ts`
- `src/rpc/rpc-client.test.ts`

---

## Additional: Telemetry removed

**Change:** Entire telemetry module removed per user request (not part of ADR spec).

**Files deleted:**
- `src/modules/telemetry.module.ts`
- `src/types/telemetry.types.ts`

**Files modified:**
- `src/constants/namespaces.constants.ts` — removed `TELEMETRY` namespace
- `src/client/MiniAppSdk.ts` — removed telemetry registration
- `src/index.ts` — removed telemetry export
- `src/cdn.ts` — removed telemetry references
