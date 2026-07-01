# Future Plans — @lizuzsusil/mini-app-sdk

## Overview

The v2 refactor unified the SDK around a single transport protocol (`postMessage` / `message` event). This document outlines the roadmap for making the SDK scalable, future-proof, and adaptable to new environments.

---

## 1. Protocol Version Negotiation

**Goal**: Host and mini-app negotiate a mutually supported protocol version at handshake time.

**Why**: Currently both sides must be updated in lockstep. Version negotiation allows gradual rollouts.

**How**:
- The `handshake` message from the mini-app includes an array of supported versions: `versions: ['2.0.0', '3.0.0']`
- The host responds with the highest mutually supported version
- `SdkTransport` adapts message serialization/routing based on the negotiated version
- New fields are appended to `PlatformMessage` with optional fallback behavior

```typescript
// Future handshake shape
interface HandshakePayload {
  moduleId: string;
  sdkVersion: string;
  supportedVersions: string[];
  capabilities: string[];  // e.g. ['streaming', 'batch', 'compression']
}
```

**Backward compatibility**: If no common version is found, fall back to oldest supported version.

---

## 2. Transport Plugin System

**Goal**: Support new environments (React Native, Electron, Chrome Extension, Web Worker) without modifying core transport logic.

**Why**: Each time a new host platform emerges, we shouldn't need a code fork or SDK rewrite.

**How**:
- Define a `TransportAdapter` interface:

```typescript
interface TransportAdapter {
  name: string;
  send(msg: PlatformMessage): void;
  start(handler: (msg: PlatformMessage) => void): void;
  stop(): void;
}
```

- Built-in adapters: `ParentPostMessageAdapter` (current), `CustomEventAdapter`
- Third-party adapters can be registered at startup:

```typescript
const sdk = new MiniAppSdk({
  moduleId: 'my-app',
  transport: new ReactNativeWebViewAdapter(),
});
```

- The adapter auto-selects based on environment detection (feature detection, not hardcoded platform checks)

---

## 3. Message Batching

**Goal**: Reduce overhead for high-throughput scenarios (telemetry, analytics).

**Why**: Each `request()` sends one `postMessage`. For bursty data (e.g., 50 telemetry events), 50 individual postMessages are wasteful.

**How**:
- `SdkTransport` accumulates messages in a microtask buffer:

```typescript
private batchQueue: PlatformMessage[] = [];

queueBatch(msg: PlatformMessage): void {
  this.batchQueue.push(msg);
  queueMicrotask(() => this.flushBatch());
}

private flushBatch(): void {
  if (this.batchQueue.length === 0) return;
  if (this.batchQueue.length === 1) {
    this.sendMessage(this.batchQueue[0]);
  } else {
    this.sendMessage({
      type: 'batch',
      payload: this.batchQueue,
      // ... envelope fields
    });
  }
  this.batchQueue = [];
}
```

- Opt-in per module: `telemetry.log()` uses batch, `auth.getUser()` uses direct

---

## 4. Streaming Support

**Goal**: Real-time streaming for large payloads (file uploads, WebSocket relay, long computations).

**Why**: Current request/response pattern requires holding the full response in memory. For streaming data (e.g., large file download), this is impractical.

**How**:
- Add `type: 'stream'` to the protocol
- The host sends multiple `stream` messages with the same `traceId` and an `index` field
- The SDK emits chunks via an async generator or callback:

```typescript
interface StreamMessage extends PlatformMessage {
  type: 'stream';
  streamIndex: number;
  streamTotal: number;
  streamLast: boolean;
}

// SDK usage
for await (const chunk of sdk.device.streamLargeFile()) {
  // process chunk
}
```

---

## 5. Connection Lifecycle & Reconnection

**Goal**: Robust handling of connection drops, visibility changes, and tab hibernation.

**Why**: Mobile browsers and WebViews frequently freeze/thaw tabs. The current SDK doesn't recover from a disconnected host.

**How**:
- Add `'connected'` | `'disconnected'` | `'reconnecting'` states to `SdkTransport`
- Heartbeat: periodic `ping`/`pong` messages between host and mini-app
- Auto-retry handshake on reconnection
- Queue pending requests during disconnection and replay on reconnect

```typescript
enum TransportState {
  Initializing,
  Connected,
  Disconnected,
  Reconnecting,
  Stopped,
}
```

---

## 6. Request Cancellation

**Goal**: Allow callers to cancel in-flight requests (e.g., user navigates away before a response arrives).

**How**:
- Extend `request()` with an `AbortSignal` parameter:

```typescript
const ac = new AbortController();
sdk.auth.getUser({ signal: ac.signal });
ac.abort(); // rejects with AbortError
```

- The SDK sends a `cancel` message to the host so it can abort expensive operations server-side

---

## 7. Security Hardening

### 7a. Origin Validation

Currently `sendMessage` uses `'*'` as the target origin. For browser iframes, the host should specify a specific origin:

```typescript
receiveMessage(origin: string): void {
  this.hostOrigin = origin; // set during handshake
}

private sendMessage(msg: PlatformMessage): void {
  window.parent.postMessage(msg, this.hostOrigin ?? '*');
}
```

### 7b. Message Signing

For sensitive operations, messages can include a signature (HMAC) using a shared key established during the handshake:

```typescript
interface PlatformMessage {
  // ...
  signature?: string;
}
```

### 7c. Permission Framework

Extend the existing `permissions` module with a capability check before sending privileged requests. If the host hasn't granted the capability, the SDK rejects locally without sending a message.

---

## 8. Observability & Debugging

**Goal**: Make it easy to debug communication issues in production.

**How**:
- Built-in trace logging:

```typescript
sdk.enableDebug({
  logMessages: true,
  logDropped: true,
  logPerformance: true,
});
```

- Expose a `getMetrics()` API returning counters (messages sent, received, timed out, avg round-trip time)
- Integrate with browser DevTools via a custom panel or `performance.mark()`/`measure()`

---

## 9. Multi-Frame / Multi-Instance Communication

**Goal**: Allow mini-apps in sibling iframes to communicate directly.

**Why**: In a dashboard with multiple mini-apps, they may need to exchange events without routing through the host.

**How**:
- The host broadcasts mini-app moduleIds during handshake
- `target` field already supports moduleId values
- Allow sending messages to sibling instances:

```typescript
sdk.sendTo('sibling-module', 'someEvent', payload);
```

---

## 10. Formal Message Schema

**Goal**: Machine-validatable protocol definition.

**How**:
- Publish a JSON Schema for `PlatformMessage`
- Auto-generate TypeScript types from the schema
- Use the schema for runtime validation in non-TypeScript environments
- Consider Protobuf or MessagePack for binary serialization in high-perf scenarios

---

## 11. Protocol Upgrade Path

**Goal**: Allow the protocol to evolve without breaking existing mini-apps.

**How**:
- Maintain a **changelog** for the protocol itself (separate from the SDK version)
- Use semantic versioning for the protocol: `MAJOR.BREAKING.MINOR`
- Backward-compatible protocol extensions (new optional fields in `PlatformMessage`)
- Deprecation notices via the `version` field in `PlatformMessage`

---

## 12. SDK Version Matrix

| SDK Version | Protocol | Features | Status |
|---|---|---|---|
| `1.x` | `1.0.0` | Dual-mode (web/flutter), `FlutterBridge`, `TransportMode` | **Deprecated** |
| `2.x` | `2.0.0` | Unified `postMessage`, plugin-ready architecture, events | **Current** |
| `3.x` | `3.0.0` (planned) | Streaming, batching, version negotiation, transport plugins | Next |

---

## Migration Path for v2 → v3+

The pluggable transport architecture in v3 will maintain backward compatibility with v2's `parent.postMessage` protocol. Mini-apps using the standard `MiniAppSdk` API will require no changes — only the transport layer beneath will be swapped.
