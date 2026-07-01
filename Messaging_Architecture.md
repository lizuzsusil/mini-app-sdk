# SDK Messaging Architecture & Integration Guide

## Version 2.0.0 — Unified Protocol

---

## Table of Contents

1. [What Changed in v2.0.0](#1-what-changed-in-v200)
2. [Universal Protocol Overview](#2-universal-protocol-overview)
3. [PlatformMessage Envelope](#3-platformmessage-envelope)
4. [Message Flow: Request / Response](#4-message-flow-request--response)
5. [Message Flow: Events](#5-message-flow-events)
6. [Inbound: Host → Mini-App](#6-inbound-host--mini-app)
7. [Outbound: Mini-App → Host](#7-outbound-mini-app--host)
8. [Integration: Web (Browser Iframe)](#8-integration-web-browser-iframe)
9. [Integration: Flutter (WebView)](#9-integration-flutter-webview)
10. [Migration Guide: v1.x → v2.0.0](#10-migration-guide-v1x--v200)
11. [Error Handling & Timeouts](#11-error-handling--timeouts)

---

## 1. What Changed in v2.0.0

### The Problem with v1.x

Version 1.x had **two parallel transport modes** selected at startup:

| Mode | Trigger | Outbound | Inbound |
|---|---|---|---|
| **Web** | No `__GOV_FLUTTER_BRIDGE__` | `parent.postMessage(msg, '*')` | `message` event listener |
| **Flutter** | `__GOV_FLUTTER_BRIDGE__` exists | `bridge.postMessage(JSON.stringify(msg))` | `govFlutterCallback` wrapper |

This meant:
- Two code paths for every operation (`if (mode === 'flutter') ... else ...`)
- Host applications had to either inject a bridge object or use `postMessage`
- Adding new environments (React Native, Electron, etc.) required new branches
- The SDK itself was coupled to specific host platforms

### What v2.0.0 Does

**Removed all platform-specific code paths.** The SDK now has one universal protocol:

- **Outbound**: `window.parent.postMessage(msg, '*')` — always
- **Inbound**: `message` event + `gov-platform-event` custom event — always

### Removed Exports (Breaking)

| Removed | Type | Reason |
|---|---|---|
| `FLUTTER_BRIDGE_KEY` | Constant | No longer needed |
| `FlutterBridge` | Interface | Removed with bridge pattern |
| `TransportMode` | Type | Single transport only |

### Removed Methods

| Method | Class | Alternative |
|---|---|---|
| `transport.getMode()` | `SdkTransport` | Not needed — single transport |
| `transport.getFlutterPlatform()` | `SdkTransport` | Use `sdk.platform.type` after `initialize()` |

### What Stayed the Same

All mini-app-facing APIs are **unchanged**:

```typescript
const sdk = await initMiniAppSdk({ moduleId: 'my-app' });
const user = await sdk.auth.getUser();
const permission = await sdk.permissions.has('camera');
sdk.on('notification.received', (payload) => { /* ... */ });
```

Methods, signatures, types (`PlatformUser`, `NavigationTarget`, etc.), and the `on()`/`destroy()` lifecycle are identical.

---

## 2. Universal Protocol Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Host Application                      │
│  (Browser parent window  OR  Flutter/React Native host)   │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │                  Iframe / WebView                  │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │              Mini App (SDK)                   │   │   │
│  │  │                                               │   │   │
│  │  │   Outbound: parent.postMessage(msg) ──────►   │   │   │
│  │  │                                               │   │   │
│  │  │   Inbound: message event ◄───────────────     │   │   │
│  │  │             CustomEvent listener ◄───────     │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

| Direction | Mechanism | Works In |
|---|---|---|
| **Mini-App → Host** | `window.parent.postMessage(msg, '*')` | Iframe (parent receives), WebView (intercepted by host) |
| **Host → Mini-App** | `window.dispatchEvent(new MessageEvent('message', ...))` | Both iframe and WebView |
| **Host → Mini-App** (alt) | `window.dispatchEvent(new CustomEvent('gov-platform-event', ...))` | Both iframe and WebView |

---

## 3. PlatformMessage Envelope

Every message exchanged follows the `PlatformMessage` interface (`src/types.ts`):

```typescript
interface PlatformMessage {
  channel: string;      // "gov-platform-sdk"
  id: string;           // unique message ID (UUID or timestamp+random)
  type: 'request' | 'response' | 'event' | 'handshake';
  namespace: string;    // domain, e.g. "auth", "device", "navigation"
  action: string;       // operation, e.g. "getUser", "location", "navigate"
  source: string;       // sender's moduleId
  target: string;       // recipient ("shell" for host, moduleId for specific app, "*" for all)
  version: string;      // protocol version ("2.0.0")
  payload?: unknown;    // request parameters or response data
  error?: PlatformError;// error object for failed responses
  traceId: string;      // correlation ID for tracing
  timestamp: number;    // epoch ms
}
```

### Message Types

| `type` | Sender | Purpose |
|---|---|---|
| `handshake` | Mini-App | Initial connection during `initialize()` |
| `request` | Mini-App | RPC call expecting a response |
| `response` | Host | Answer to a prior request (matched by `id`) |
| `event` | Host | Unsolicited push notification |

---

## 4. Message Flow: Request / Response

This is the core RPC mechanism used by all SDK methods like `auth.getUser()`, `device.location()`, `http.get()`, etc.

```
Mini App                         SdkTransport                        Host
   │                                  │                               │
   │  sdk.auth.getUser()              │                               │
   │─────────────────────────────────►│                               │
   │                                  │  createMessage()              │
   │                                  │  {type:"request",            │
   │                                  │   namespace:"auth",          │
   │                                  │   action:"getUser",          │
   │                                  │   id:"abc123",               │
   │                                  │   target:"shell",            │
   │                                  │   source:"my-app", ...}      │
   │                                  │                               │
   │                                  │  pending.set("abc123")        │
   │                                  │  start 10s timer             │
   │                                  │                               │
   │                                  │  window.parent                │
   │                                  │  .postMessage(msg, '*')       │
   │                                  │──────────────────────────────►│
   │                                  │                               │ process
   │                                  │                               │ request
   │                                  │                               │
   │                                  │  message event                 │
   │                                  │◄──────────────────────────────│ {type:"response",
   │                                  │                               │  id:"abc123",
   │                                  │  handleIncomingMessage()       │  traceId:"...",
   │                                  │  pending.get("abc123")         │  payload:{...}}
   │                                  │  clearTimeout(timer)          │
   │                                  │  pending.delete("abc123")     │
   │                                  │  resolve(payload)             │
   │                                  │                               │
   │◄─────────────────────────────────│                               │
   │  PlatformUser                    │                               │
```

### Retry Logic

If a request times out or fails with a `retryable` error, the SDK retries up to `retryAttempts` times (default: 2) with exponential backoff (`retryDelayMs * (attempt + 1)`, default starting at 500ms). Non-retryable errors are thrown immediately.

---

## 5. Message Flow: Events

The host can push unsolicited notifications to the mini-app at any time:

```
Host                                          Mini App (SDK)
  │                                               │
  │  On some trigger (notification, config         │
  │  change, theme update, etc.):                 │
  │                                               │
  │  window.dispatchEvent(                        │
  │    new MessageEvent('message', {              │
  │      data: {                                  │
  │        type: 'event',                         │
  │        namespace: 'notification',             │
  │        action: 'received',                    │
  │        target: 'my-mini-app',                 │
  │        payload: { title: '...', body: '...' } │
  │      },                                       │
  │      origin: location.origin                  │
  │    })                                         │
  │  )                                            │
  │                                               │
  │──────────────────────────────────────────────►│
  │                                               │ handleIncomingMessage()
  │                                               │ find handlers for
  │                                               │ "notification.received"
  │                                               │ invoke each handler
  │                                               │ with payload
```

### Subscribing in the Mini-App

```typescript
const unsubscribe = sdk.on('notification.received', (payload) => {
  console.log('Notification:', payload);
});

// Later, to unsubscribe:
unsubscribe();
```

The SDK also sends a `request('event', 'subscribe', { eventType })` to notify the host that the mini-app is interested in a specific event type.

---

## 6. Inbound: Host → Mini-App

The SDK registers two listeners when `transport.start()` is called:

### 6a. `message` Event (Primary)

```typescript
// src/transport.ts
window.addEventListener('message', (event) => {
  if (!isPlatformMessage(event.data)) return;
  this.handleIncomingMessage(event.data);
});
```

`isPlatformMessage` validates that `id`, `type`, `namespace`, and `action` are all strings.

### 6b. `gov-platform-event` Custom Event (Secondary)

```typescript
// src/transport.ts
window.addEventListener('gov-platform-event', (event) => {
  const msg = (event as CustomEvent<PlatformMessage>).detail;
  if (!isPlatformMessage(msg)) return;
  this.handleIncomingMessage(msg);
});
```

### Target Filtering

Messages where `target` is neither this module's `moduleId` nor `'*'` are silently dropped.

### Inbound Validation Summary

| Check | What | When |
|---|---|---|
| Structural | `isPlatformMessage()` — has required string fields | Listener level |
| Targeting | `target === moduleId \|\| target === '*'` | `handleIncomingMessage()` |
| Response ID match | `pending.has(msg.id)` | Response handling |
| Event handler exists | `eventHandlers.has(namespace.action)` | Event dispatching |

---

## 7. Outbound: Mini-App → Host

All outbound messages go through one line:

```typescript
// src/transport.ts
private sendMessage(msg: PlatformMessage): void {
  window.parent.postMessage(msg, '*');
}
```

### In a Browser Iframe

`window.parent` is the real parent frame. `postMessage` delivers directly to the parent's `message` event. The parent checks `event.source === iframe.contentWindow` to verify the message origin.

### In a Flutter WebView

`window.parent` is the same window (`parent === window`). The `postMessage` dispatches to the same window's `message` event. The SDK's own `message` listener picks it up, but **request messages are filtered by target**: they have `target: "shell"`, not the module's ID, so `handleIncomingMessage` drops them. No self-loop.

To actually receive these messages on the Flutter side, the host must **intercept `parent.postMessage`** (see [Flutter Integration](#9-integration-flutter-webview)).

---

## 8. Integration: Web (Browser Iframe)

### Full Working Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Host Application</title>
</head>
<body>
  <iframe
    id="mini-app"
    src="https://mini-app.example.com"
    data-module-id="my-mini-app"
    style="width: 100%; height: 600px; border: none;"
  ></iframe>

  <script>
    const iframe = document.getElementById('mini-app');

    // ───────────────────────────────────────────
    // Receive messages from the mini-app
    // ───────────────────────────────────────────
    window.addEventListener('message', (event) => {
      // Security: verify the message came from our iframe
      if (event.source !== iframe.contentWindow) return;

      const msg = event.data;
      if (msg?.channel !== 'gov-platform-sdk') return;

      console.log('[Host] Received from mini-app:', msg);

      if (msg.type === 'handshake') {
        // Mini-app has initialized. Respond to complete the handshake.
        iframe.contentWindow.postMessage({
          channel: 'gov-platform-sdk',
          id: msg.id,                    // same ID to match pending promise
          type: 'response',
          namespace: 'handshake',
          action: '',
          source: 'shell',
          target: msg.source,            // echo back the mini-app's moduleId
          version: '2.0.0',
          traceId: msg.traceId,
          timestamp: Date.now(),
          payload: { status: 'ok' },
        }, '*');
      }

      if (msg.type === 'request') {
        handleRequest(msg).then((result) => {
          iframe.contentWindow.postMessage({
            channel: 'gov-platform-sdk',
            id: msg.id,
            type: 'response',
            namespace: msg.namespace,
            action: msg.action,
            source: 'shell',
            target: msg.source,
            version: '2.0.0',
            traceId: msg.traceId,
            timestamp: Date.now(),
            payload: result,
          }, '*');
        }).catch((error) => {
          iframe.contentWindow.postMessage({
            channel: 'gov-platform-sdk',
            id: msg.id,
            type: 'response',
            namespace: msg.namespace,
            action: msg.action,
            source: 'shell',
            target: msg.source,
            version: '2.0.0',
            traceId: msg.traceId,
            timestamp: Date.now(),
            error: { code: 'ERROR', message: error.message },
          }, '*');
        });
      }
    });

    // ───────────────────────────────────────────
    // Send an event to the mini-app
    // ───────────────────────────────────────────
    function sendEventToMiniApp(namespace, action, payload) {
      iframe.contentWindow.postMessage({
        channel: 'gov-platform-sdk',
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        type: 'event',
        namespace,
        action,
        source: 'shell',
        target: iframe.dataset.moduleId,
        version: '2.0.0',
        traceId: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        payload,
      }, '*');
    }

    // Example: push a notification
    setTimeout(() => {
      sendEventToMiniApp('notification', 'received', {
        title: 'Welcome!',
        body: 'Your mini-app is connected.',
      });
    }, 2000);

    // ───────────────────────────────────────────
    // Request handler — implement your business logic
    // ───────────────────────────────────────────
    async function handleRequest(msg) {
      switch (`${msg.namespace}.${msg.action}`) {
        case 'auth.getUser':
          return { id: '1', name: 'John', email: 'john@example.com', roles: [], permissions: [] };
        case 'platform.getType':
          return 'WEB';
        case 'device.location':
          return { latitude: 51.5074, longitude: -0.1278 };
        default:
          console.warn('Unknown request:', msg.namespace, msg.action);
          return null;
      }
    }
  </script>
</body>
</html>
```

### Key Points for Web Hosts

| Concern | Recommendation |
|---|---|
| **Origin security** | Check `event.source === iframe.contentWindow` on every message |
| **Response correlation** | Always echo back the request's `id` in the response |
| **Target field** | Set `target` to the mini-app's `moduleId` (comes from `msg.source`) |
| **Channel check** | Verify `event.data?.channel === 'gov-platform-sdk'` |

---

## 9. Integration: Flutter (WebView)

When using a Flutter WebView (e.g., `webview_flutter`), there is no parent frame. The SDK's `parent.postMessage` dispatches to the same window, so the Flutter host must intercept it.

### Complete Flutter Host Setup

```dart
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'dart:convert';

class MiniAppScreen extends StatefulWidget {
  @override
  State<MiniAppScreen> createState() => _MiniAppScreenState();
}

class _MiniAppScreenState extends State<MiniAppScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      // ───────────────────────────────────────────
      // Step 1: Intercept parent.postMessage
      // Inject BEFORE the mini-app loads
      // ───────────────────────────────────────────
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel('__govOutbound',
        onMessageReceived: (message) {
          _handleOutboundMessage(message.message);
        },
      )
      ..loadRequest(Uri.parse('https://mini-app.example.com'));

    // Inject the interceptor on page load
    _controller.runJavaScript('''
      (function() {
        var orig = window.parent.postMessage;
        window.parent.postMessage = function(msg, origin) {
          try {
            window.__govOutbound.postMessage(JSON.stringify(msg));
          } catch(e) {
            // ignore serialization errors
          }
          return orig.apply(window.parent, arguments);
        };
      })();
    ''');
  }

  // ───────────────────────────────────────────
  // Step 2: Handle outbound messages
  // ───────────────────────────────────────────
  void _handleOutboundMessage(String jsonString) {
    try {
      final msg = jsonDecode(jsonString) as Map<String, dynamic>;
      final type = msg['type'] as String?;
      final id = msg['id'] as String?;
      final namespace = msg['namespace'] as String?;
      final action = msg['action'] as String?;
      final source = msg['source'] as String?;
      final traceId = msg['traceId'] as String?;

      print('[Flutter] Received from mini-app: $namespace.$action');

      if (type == 'handshake') {
        _sendResponse(id!, source!, traceId!, namespace!, action!,
          payload: {'status': 'ok'});
      } else if (type == 'request') {
        _processRequest(id!, source!, traceId!, namespace!, action!,
          msg['payload']);
      }
    } catch (e) {
      print('Failed to parse outbound message: $e');
    }
  }

  // ───────────────────────────────────────────
  // Step 3: Send responses back to mini-app
  // ───────────────────────────────────────────
  Future<void> _sendResponse(
    String id,
    String target,
    String traceId,
    String namespace,
    String action, {
    dynamic payload,
    Map<String, dynamic>? error,
  }) async {
    final response = {
      'channel': 'gov-platform-sdk',
      'id': id,
      'type': 'response',
      'namespace': namespace,
      'action': action,
      'source': 'shell',
      'target': target,
      'version': '2.0.0',
      'traceId': traceId,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      if (error != null) 'error': error,
      if (payload != null) 'payload': payload,
    };

    final safeJson = jsonEncode(response)
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'");

    await _controller.runJavaScript(
      "window.dispatchEvent(new MessageEvent('message', "
      "{ data: JSON.parse('$safeJson'), origin: location.origin }))"
    );
  }

  // ───────────────────────────────────────────
  // Step 4: Process requests — implement logic
  // ───────────────────────────────────────────
  Future<void> _processRequest(
    String id,
    String target,
    String traceId,
    String namespace,
    String action,
    dynamic payload,
  ) async {
    try {
      dynamic result;

      switch ('$namespace.$action') {
        case 'auth.getUser':
          result = {
            'id': '1', 'name': 'John', 'email': 'john@example.com',
            'roles': [], 'permissions': [],
          };
          break;
        case 'platform.getType':
          result = 'ANDROID'; // or 'IOS'
          break;
        case 'device.location':
          result = {'latitude': 51.5074, 'longitude': -0.1278};
          break;
        default:
          print('Unknown request: $namespace.$action');
      }

      await _sendResponse(id, target, traceId, namespace, action,
        payload: result);
    } catch (e) {
      await _sendResponse(id, target, traceId, namespace, action,
        error: {'code': 'ERROR', 'message': e.toString()});
    }
  }

  // ───────────────────────────────────────────
  // Step 5: Send events to mini-app
  // ───────────────────────────────────────────
  Future<void> sendEventToMiniApp(
    String namespace,
    String action,
    dynamic payload,
  ) async {
    final event = {
      'channel': 'gov-platform-sdk',
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'type': 'event',
      'namespace': namespace,
      'action': action,
      'source': 'shell',
      'target': 'my-mini-app', // moduleId
      'version': '2.0.0',
      'traceId': DateTime.now().millisecondsSinceEpoch.toString(),
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'payload': payload,
    };

    final safeJson = jsonEncode(event)
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'");

    await _controller.runJavaScript(
      "window.dispatchEvent(new MessageEvent('message', "
      "{ data: JSON.parse('$safeJson'), origin: location.origin }))"
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Mini App Host')),
      body: WebViewWidget(controller: _controller),
    );
  }
}
```

### Flutter Integration Summary

| Step | What | When |
|---|---|---|
| 1 | Override `window.parent.postMessage` | Before mini-app loads (`onPageStarted` or initial injection) |
| 2 | Add `JavaScriptChannel('__govOutbound')` | Before mini-app loads |
| 3 | Send responses via `MessageEvent` | On receiving a request/handshake |
| 4 | Push events via `MessageEvent` | Anytime after connection |

### JSON Safety in Dart

Always sanitize JSON when interpolating into JavaScript:

```dart
String safeJson = jsonEncode(message)
  .replaceAll("\\", "\\\\")
  .replaceAll("'", "\\'");
```

This prevents both injection attacks and syntax errors from special characters in payloads.

---

## 10. Migration Guide: v1.x → v2.0.0

### If You Are a Mini-App Developer

**No changes required.** All SDK method signatures, types, and behaviors are identical. Update the package version and rebuild:

```bash
npm install @lizuzsusil/mini-app-sdk@^2.0.0
```

The only behavioral change: `sdk.platform.type` is now always determined via a request to the host (`request('platform', 'getType')`) instead of being read from the bridge object. Mini-apps that `await initialize()` before accessing `platform` will not notice any difference.

### If You Are a Host Application Developer

#### Web (Browser Iframe) — No Changes

The iframe integration is identical. The SDK always sends via `parent.postMessage` and receives via `message` events. No migration needed.

#### Flutter (WebView) — Required Changes

**Before (v1.x):** The host injected `__GOV_FLUTTER_BRIDGE__` on `window` and called `window.govFlutterCallback(jsonString)` to send messages:

```dart
// v1.x — OLD approach (no longer works)
await controller.runJavaScript('''
  window.__GOV_FLUTTER_BRIDGE__ = {
    postMessage: function(json) {
      // receive from mini-app
    },
    platform: 'ANDROID',
  };
''');

// Send to mini-app:
await controller.runJavaScript("window.govFlutterCallback('$json')");
```

**After (v2.0.0):** The host intercepts `parent.postMessage` for outbound and dispatches `MessageEvent` for inbound:

```dart
// v2.0.0 — NEW approach
// 1. Intercept outbound
await controller.runJavaScript('''
  (function() {
    var orig = window.parent.postMessage;
    window.parent.postMessage = function(msg, origin) {
      window.__govOutbound.postMessage(JSON.stringify(msg));
      return orig.apply(window.parent, arguments);
    };
  })();
''');

// 2. Listen for outbound
controller.addJavaScriptChannel('__govOutbound',
  onMessageReceived: (message) { /* handle */ },
);

// 3. Send to mini-app
await controller.runJavaScript(
  "window.dispatchEvent(new MessageEvent('message', "
  "{ data: JSON.parse('$safeJson'), origin: location.origin }))"
);
```

---

## 11. Error Handling & Timeouts

### SDK Error Types

| Error | Source | Retryable | Code |
|---|---|---|---|
| `SdkError` | Host returns `error` in response | `error.retryable` | Host-defined |
| Timeout | No response within `timeout` ms (default 10s) | Yes | `TIMEOUT` |
| Transport stopped | `sdk.destroy()` called while requests pending | No | `Error` |

### Host Error Responses

To signal an error from your host, include an `error` field instead of `payload`:

```typescript
iframe.contentWindow.postMessage({
  channel: 'gov-platform-sdk',
  id: msg.id,             // must match the request ID
  type: 'response',
  // ... other fields ...
  error: {
    code: 'PERMISSION_DENIED',
    message: 'User denied camera access',
    retryable: false,             // SDK will not retry
    details: { permission: 'camera' },
  },
}, '*');
```

### Timeout Configuration

The timeout and retry behavior are configurable when initializing the SDK:

```typescript
const sdk = await initMiniAppSdk({
  moduleId: 'my-app',
  timeout: 15000,          // 15 seconds (default: 10000)
  retryAttempts: 3,        // 3 retries (default: 2)
  retryDelayMs: 1000,      // 1s base delay (default: 500)
});
```

---

## Appendix: Quick Reference

### SDK Source Files

| File | Role |
|---|---|
| `src/types.ts` | `PlatformMessage`, all module interfaces, option types |
| `src/constants.ts` | Protocol version (`2.0.0`), channel name, event name |
| `src/transport.ts` | `SdkTransport` — message send/receive, pending map, event handlers |
| `src/sdk.ts` | `MiniAppSdk` — public API, module creation, lifecycle |
| `src/utils.ts` | `createMessage()`, `isPlatformMessage()`, `generateId()`, `delay()` |
| `src/errors.ts` | `SdkError` wrapper |
| `src/cdn.ts` | CDN/registry entry for multi-instance management |

### Reserved Namespace / Action Pairs

| Namespace | Action | Direction | Purpose |
|---|---|---|---|
| `handshake` | (empty) | Mini-App → Host | Connection setup |
| `platform` | `getType` | Mini-App → Host | Get platform type (`WEB`, `ANDROID`, `IOS`) |
| `event` | `subscribe` | Mini-App → Host | Register event interest |
| Any | Any | Host → Mini-App | Push events (`type: 'event'`) |
| Any | Any | Both | Request/response (`type: 'request'` / `type: 'response'`) |
