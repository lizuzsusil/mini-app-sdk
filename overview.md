# mini-app-sdk — Internal Architecture Overview

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│  Mini App (iframe / Flutter WebView)                 │
│                                                       │
│  ┌─────────────┐      ┌───────────────────────────┐  │
│  │ React Layer │      │ Vanilla JS / Other         │  │
│  │ (Provider,  │      │ (initMiniAppSdk)           │  │
│  │  hooks)     │      │                            │  │
│  └──────┬──────┘      └──────────┬────────────────┘  │
│         │                        │                    │
│         └────────┬───────────────┘                    │
│                  │                                    │
│         ┌────────▼────────┐                          │
│         │  MiniAppSdk     │                          │
│         │  (src/index.ts) │                          │
│         │                 │                          │
│         │  ┌───────────┐  │                          │
│         │  │ auth       │  │  SDK modules            │
│         │  │ permissions│  │  (each maps to          │
│         │  │ flags      │  │   transport.request)    │
│         │  │ config     │  │                          │
│         │  │ navigation │  │                          │
│         │  │ telemetry  │  │                          │
│         │  │ platform   │  │                          │
│         │  │ device     │  │                          │
│         │  │ http       │  │                          │
│         │  └─────┬─────┘  │                          │
│         │        │        │                          │
│         │  ┌─────▼─────┐  │                          │
│         │  │SdkTransport│  │  Core transport layer    │
│         │  └─────┬─────┘  │                          │
│         └────────┼────────┘                          │
│                  │                                    │
│         ┌────────▼────────┐                          │
│         │  Message Channel │                          │
│         │  (PlatformMessage)│                         │
│         └────────┬────────┘                          │
└──────────────────┼───────────────────────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │              │              │
    ▼              ▼              ▼
window.parent  FlutterBridge   CustomEvent
(postMessage)  (native)       (gov-platform-event)
    │              │              │
    └──────────────┴──────────────┘
                   │
┌──────────────────┴───────────────────────────────────┐
│  Host Shell (parent window / Flutter app)            │
│                                                       │
│  ┌───────────────────────────────────────────────┐   │
│  │  Message Router                               │   │
│  │  (routes by namespace.action)                 │   │
│  │                                               │   │
│  │  ┌────────┐ ┌─────────┐ ┌───────┐ ┌──────┐  │   │
│  │  │ auth   │ │permissions│ │flags  │ │ ...  │  │   │
│  │  └────────┘ └─────────┘ └───────┘ └──────┘  │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

## 2. Message Protocol (`PlatformMessage`)

Every piece of communication between the mini app and the host shell uses the same envelope:

```typescript
interface PlatformMessage {
  channel: 'gov-platform-sdk';   // Fixed channel identifier
  id: string;                     // Unique message ID (UUID or timestamp+random)
  type: 'request' | 'response' | 'event' | 'handshake';
  namespace: string;              // e.g. 'auth', 'navigation', 'device'
  action: string;                 // e.g. 'getUser', 'navigate'
  source: string;                 // The moduleId of the sender
  target: string;                 // 'shell' or '*' for broadcast
  version: '1.0.0';              // Protocol version
  payload?: unknown;              // Request params or response data
  error?: PlatformError;          // Error details if the request failed
  traceId: string;                // Correlation ID for request chains
  timestamp: number;              // Epoch ms
}
```

Message types:
- **`handshake`** — Connection establishment on init
- **`request`** — Method call from mini app to shell (e.g. `auth.getUser`)
- **`response`** — Reply from shell, matched by `id` to the original request
- **`event`** — Unsolicited push from shell (e.g. `notification.received`)

## 3. Transport Layer (`SdkTransport`)

The transport auto-detects its mode based on the runtime environment. All incoming/outgoing logic is centralized here.

### Mode Detection (auto at `transport.start()`)

```
window.__GOV_FLUTTER_BRIDGE__ exists?
  ├── YES → 'flutter' mode
  └── NO  → 'web' mode
```

### Web Mode (`window.parent.postMessage`)

**Sending:** `window.parent.postMessage(msg, '*')`

**Receiving** — two listeners on `window`:
1. **`message` event** — Standard `MessageEvent`; checks `isPlatformMessage(event.data)`
2. **`gov-platform-event`** — `CustomEvent` where the message is in `event.detail`

### Flutter Native Bridge Mode

**Sending:** `flutterBridge.postMessage(JSON.stringify(msg))`

**Receiving:** Overrides `window.govFlutterCallback` — the Flutter layer calls this with a JSON string when it has a message for the mini app. The SDK parses it, validates it, and routes it. The original callback is saved and chained so other code isn't broken.

### Pending Request Tracking

The transport maintains a `Map<string, PendingRequest>` that maps message IDs to `{ resolve, reject, timer }`. When `sendRequest` fires:
1. A `Promise` is created
2. A timeout timer is set (`default: 10s`)
3. The promise resolve/reject + timer are stored in the map by message `id`
4. The message is sent via the active transport

When a `response` arrives:
1. The matching `id` is looked up in the map
2. The timer is cleared
3. `resolve` or `reject` is called based on whether the response has an `error`

### Retry Logic

The public `request()` method wraps `sendRequest()` with retry:
- Default: **2 retries** (3 total attempts)
- Exponential backoff: `retryDelayMs * (attempt + 1)` (default: 500ms, 1000ms)
- Non-retryable errors (`SdkError` with `retryable: false`) skip retry and throw immediately
- Timeout errors are retryable by default

## 4. Handshake

The handshake is the **connection establishment** step. It happens during `MiniAppSdk.initialize()`.

```
MiniAppSdk creates a handshake PlatformMessage:
  type:    'handshake'
  namespace: 'handshake'
  target:  'shell'
  payload: { moduleId: 'my-app', sdkVersion: '1.0.0' }

It creates a pending promise (same mechanism as requests)
and sends the message.

The shell MUST respond with a 'response' message whose
'id' matches the handshake's 'id'.

If no response arrives within the timeout (default 10s),
the handshake fails with 'Handshake timed out'.
```

Without a successful handshake, the SDK will not consider itself initialized and all subsequent requests will fail.

## 5. Initialization Flow

```
createMiniAppSdk(options)
  └─ new MiniAppSdk(options)
       ├─ Creates SdkTransport (moduleId, timeout, retry config)
       ├─ Generates a traceId for the session
       ├─ Creates all 8 module objects (auth, permissions, etc.)
       │  └─ Each module method wraps transport.request(namespace, action, payload)
       └─ Returns the instance (NOT yet initialized)

await sdk.initialize()
  ├─ transport.start()
  │   ├─ Detects mode (web vs flutter)
  │   ├─ Sets up listeners on window (message, CustomEvent)
  │   └─ OR overrides Flutter callback
  ├─ transport.handshake()
  │   ├─ Sends handshake message to shell
  │   └─ Waits for matching response
  ├─ Gets platform type
  │   ├─ Flutter: reads bridge.platform ('ANDROID' | 'IOS')
  │   └─ Web: sends request 'platform.getType' → expects 'WEB'
  └─ Sets initialized = true
```

## 6. SDK Modules

Each module is a plain object with methods that delegate to `transport.request()`. The `namespace` parameter directly maps to the module name:

| Module        | Namespace      | Example Request          |
|---------------|----------------|--------------------------|
| `auth`        | `auth`         | `request('auth', 'getUser')` |
| `permissions` | `permissions`  | `request('permissions', 'has', { permission })` |
| `flags`       | `flags`        | `request('flags', 'isEnabled', { flag })` |
| `config`      | `config`       | `request('config', 'get', { key })` |
| `navigation`  | `navigation`   | `request('navigation', 'navigate', target)` |
| `telemetry`   | `telemetry`    | `request('telemetry', 'track', { event })` |
| `platform`    | `platform`     | `request('platform', 'getType')` |
| `device`      | `device`       | `request('device', 'location', options)` |
| `http`        | `http`         | `request('http', 'get', { endpoint, query, headers })` |

The **`platform` module** is special — its `type` property is set during initialization and cached locally. `isWeb()`, `isAndroid()`, `isIOS()`, and `isMobile()` are synchronous, derived from the cached type.

All other module methods are async and go through the full request/response cycle.

## 7. Event System

Events allow the shell to push messages to the mini app asynchronously.

**Subscription flow:**

```
sdk.on('notification.received', handler)
  ├─ Registers handler in MiniAppSdk's eventHandlers map
  ├─ Sends a subscribe request to the shell:
  │   transport.request('event', 'subscribe', { eventType: 'notification.received' })
  │   (fire-and-forget; failure is caught silently)
  ├─ Registers same handler in transport.eventHandlers
  └─ Returns an unsubscribe function that removes the handler from both maps
```

**Delivery flow:**

When a `PlatformMessage` with `type: 'event'` arrives at the transport:
1. The handler map is keyed by `namespace.action` (e.g. `notification.received`)
2. All handlers in the matching `Set` are invoked with `msg.payload`

## 8. React Integration

The React layer (`src/react/index.tsx`) wraps the core SDK:

```
<MiniAppSdkProvider moduleId="my-app">
  └─ On mount:
       ├─ createMiniAppSdk({ moduleId })
       ├─ instance.initialize()           ← handshake happens here
       ├─ instance.auth.getUser()         ← fetches the user
       ├─ Sets isReady = true
       └─ instance.telemetry.track('mini_app.mounted')
  └─ On unmount:
       └─ instance.destroy()              ← tears down transport
```

Hooks:
- **`useMiniAppSdk()`** — Returns the `MiniAppSdk` instance (throws outside provider)
- **`usePlatformUser()`** — Returns the cached `PlatformUser | null`
- **`useSdkReady()`** — Returns `boolean` (false while connecting/handshaking)

## 9. Error Handling

`SdkError` is the custom error type throughout the SDK:

```typescript
class SdkError extends Error {
  code: string;          // Machine-readable error code (e.g. 'TIMEOUT')
  retable: boolean;      // Whether the operation can be retried
  details?: Record<string, unknown>;
}
```

Errors propagate through the transport's pending promise resolution — when a response contains an `error` field, `reject(new SdkError(msg.error))` is called. The retry logic in `transport.request()` catches `SdkError` and retries unless `retryable` is `false`.

## 10. Lifecycle

```
Creation:  new MiniAppSdk(options) or createMiniAppSdk(options)
              ↓
Init:       await sdk.initialize()
              ↓  Handshake, platform detection
Ready:      sdk.initialized === true
              ↓
Usage:      sdk.auth.getUser(), sdk.device.location(), sdk.on(...)
              ↓
Destroy:    sdk.destroy()
              ├─ transport.stop() — removes listeners, flushes pending
              ├─ Clears event handlers
              └─ Sets initialized = false
```

## 11. Key Design Decisions

1. **Single-file core** — The entire SDK runtime (transport, protocol, modules) is in one file (`src/index.ts`, ~700 lines). Simple to audit and bundle.

2. **No external dependencies** — Zero runtime deps. Only `tsup` for building and `react` as optional peer dep.

3. **Web postMessage compatible with any parent** — Uses `*` as target origin. The shell is responsible for validating message origin on its side.

4. **Flutter bridge via global override** — The SDK takes over `window.govFlutterCallback`, chains to the original, and feeds parsed messages into the same handler pipeline.

5. **Event subscriptions synced with shell** — When `sdk.on()` is called, it proactively notifies the shell via a `subscribe` request so the shell knows which events to forward.

6. **Session traceId** — A single `traceId` is generated per SDK instance and attached to all outgoing requests for correlation.
