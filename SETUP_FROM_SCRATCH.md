# SDK from Scratch — Setup Guide (Module Federation)

This guide walks you through building a **minimal SDK** for a **Module Federation** setup where host and mini-apps share the same window/JS runtime (loaded via `remoteEntry.js`). It follows the same pattern as this codebase but strips everything down to the essentials.

---

## 1. Core Idea

```
┌─────────────────────────────────────────────────────┐
│              SAME WINDOW / JS RUNTIME                 │
│                                                       │
│  ┌─────────────────────┐   ┌─────────────────────┐   │
│  │   HOST (shell)       │   │  MINI-APP (remote)  │   │
│  │                      │   │                      │   │
│  │  window.addEventListener("message", ...) ◄───┐  │   │
│  │                      │   │  sdk.auth.getUser()│  │   │
│  │  window.postMessage( │   │    → window.       │  │   │
│  │    response, "*")───►│   │      postMessage() │  │   │
│  └─────────────────────┘   └─────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Key difference from iframe SDKs**: Everything is in the **same window**. No `window.parent`, no origin isolation. Instead:
- Outbound: `window.postMessage(msg, "*")` — dispatches to the **same window's** `message` listeners
- Inbound: `window.addEventListener("message", ...)` — both host and mini-app listen on the same window

**Why this works without self-loop**: Request messages target `"shell"`, so the SDK's own listener drops them (filtered by target). Response messages target the mini-app's `moduleId`, so only the matching SDK instance picks them up.

---

## 2. Project Structure

---

## 2. Project Structure

```
my-sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── types.ts         # Message envelope & interfaces
│   ├── constants.ts     # Version, channel name
│   ├── utils.ts         # Message creation, ID gen, validation
│   ├── transport.ts     # Send/receive via window.postMessage (same window)
│   ├── sdk.ts           # Public API — MiniAppSdk class
│   └── index.ts         # Re-exports
├── host-shell.ts        # Host shell setup — register message listener
└── mini-app-entry.ts    # Mini-app entry — creates and uses the SDK
```

---

## 3. The Message Envelope (`src/types.ts`)

This is **the most important file**. Every message between host and mini-app looks the same:

```typescript
export interface PlatformMessage {
  channel: string;      // namespace to filter your messages
  id: string;           // unique ID — correlates request↔response
  type: "request" | "response" | "event" | "handshake";
  namespace: string;    // e.g. "auth", "device"
  action: string;       // e.g. "getUser", "location"
  source: string;       // sender's module ID
  target: string;       // "shell" for host, moduleId for a specific app
  version: string;
  payload?: unknown;
  error?: { code: string; message: string };
  traceId: string;
  timestamp: number;
}
```

---

## 4. Constants & Utils (`src/constants.ts`, `src/utils.ts`)

```typescript
// constants.ts
export const PROTOCOL_VERSION = "1.0.0";
export const MESSAGE_CHANNEL = "my-sdk-channel";
```

```typescript
// utils.ts
import { MESSAGE_CHANNEL, PROTOCOL_VERSION } from "./constants";
import type { PlatformMessage } from "./types";

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createMessage(
  type: PlatformMessage["type"],
  namespace: string,
  action: string,
  source: string,
  target: string,
  payload?: unknown
): PlatformMessage {
  return {
    channel: MESSAGE_CHANNEL,
    id: generateId(),
    type,
    namespace,
    action,
    source,
    target,
    version: PROTOCOL_VERSION,
    payload,
    traceId: generateId(),
    timestamp: Date.now(),
  };
}

export function isPlatformMessage(data: unknown): data is PlatformMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.type === "string" &&
    typeof m.namespace === "string" &&
    typeof m.action === "string"
  );
}
```

---

## 5. Transport Layer (`src/transport.ts`)

This is the engine. It sends messages via `window.postMessage` (to the **same window**), receives via `message` events, and matches responses to pending requests.

```typescript
import { createMessage, generateId, isPlatformMessage } from "./utils";
import type { PlatformMessage } from "./types";

type Handler = (payload: unknown) => void;

export class SdkTransport {
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private eventHandlers = new Map<string, Set<Handler>>();
  private listener: ((e: MessageEvent) => void) | null = null;

  constructor(
    private moduleId: string,
    private channel: string
  ) {}

  start() {
    this.listener = (event: MessageEvent) => {
      if (!isPlatformMessage(event.data)) return;
      if (event.data.channel !== this.channel) return;
      this.handleMessage(event.data);
    };
    window.addEventListener("message", this.listener);
  }

  stop() {
    if (this.listener) window.removeEventListener("message", this.listener);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Transport stopped"));
    }
    this.pending.clear();
    this.eventHandlers.clear();
  }

  private handleMessage(msg: PlatformMessage) {
    if (msg.target !== this.moduleId && msg.target !== "*") return;

    if (msg.type === "response") {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.payload);
      }
    }

    if (msg.type === "event") {
      const key = `${msg.namespace}.${msg.action}`;
      this.eventHandlers.get(key)?.forEach((h) => h(msg.payload));
    }
  }

  request<T>(namespace: string, action: string, payload?: unknown): Promise<T> {
    const msg = createMessage("request", namespace, action, this.moduleId, "shell", payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error(`Request ${namespace}.${action} timed out`));
      }, 10000);

      this.pending.set(msg.id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      window.postMessage(msg, "*");
    });
  }

  async handshake(): Promise<void> {
    const msg = createMessage("handshake", "handshake", "", this.moduleId, "shell", {
      moduleId: this.moduleId,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error("Handshake timed out"));
      }, 10000);

      this.pending.set(msg.id, {
        resolve: () => resolve(),
        reject,
        timer,
      });

      window.postMessage(msg, "*");
    });
  }

  onEvent(event: string, handler: Handler): () => void {
    if (!this.eventHandlers.has(event))
      this.eventHandlers.set(event, new Set());
    this.eventHandlers.get(event)!.add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }
}
```

### ⚠️ Key Concern: Self-Loop Prevention

Since `window.postMessage` dispatches to the **same window**, the SDK's own `message` listener will receive its own outgoing messages. This is handled by **target filtering**:

| Message Type | `target` | SDK's own handler | Host handler |
|---|---|---|---|
| `request` | `"shell"` | ❌ dropped (target !== moduleId) | ✅ processes it |
| `response` | `moduleId` | ✅ resolves pending promise | ❌ dropped (target !== hostId) |
| `event` | `moduleId` or `"*"` | ✅ dispatches to handlers | depends |
| `handshake` | `"shell"` | ❌ dropped (target !== moduleId) | ✅ processes it |

Additionally, the **channel filter** (`event.data.channel !== this.channel`) prevents the SDK from processing messages from other SDK instances or unrelated `postMessage` traffic on the page.

---

## 6. SDK Class (`src/sdk.ts`)

The public API that mini-app developers call. Kept minimal — just auth and a generic request method to prove the pattern.

```typescript
import { SdkTransport } from "./transport";
import type { PlatformMessage } from "./types";

type EventHandler = (payload: unknown) => void;

export interface AuthModule {
  getUser(): Promise<{ id: string; name: string; email: string } | null>;
  isAuthenticated(): Promise<boolean>;
}

export class MiniAppSdk {
  readonly moduleId: string;
  auth: AuthModule;
  private transport: SdkTransport;
  private initialized = false;

  constructor(options: { moduleId: string; channel?: string }) {
    this.moduleId = options.moduleId;
    this.transport = new SdkTransport(options.moduleId, options.channel ?? "my-sdk-channel");
    this.auth = this.createAuthModule();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.transport.start();
    await this.transport.handshake();
    this.initialized = true;
  }

  destroy(): void {
    this.transport.stop();
    this.initialized = false;
  }

  on(event: string, handler: EventHandler): () => void {
    return this.transport.onEvent(event, handler);
  }

  private createAuthModule(): AuthModule {
    return {
      getUser: () =>
        this.transport.request<{ id: string; name: string; email: string } | null>(
          "auth", "getUser"
        ),
      isAuthenticated: () =>
        this.transport.request<boolean>("auth", "isAuthenticated"),
    };
  }
}
```

---

## 7. Index Barrel (`src/index.ts`)

```typescript
export { MiniAppSdk } from "./sdk";
export type { AuthModule } from "./sdk";
export type { PlatformMessage } from "./types";
```

---

## 8. The Mini-App Entry (`mini-app-entry.ts`)

This is what runs inside the mini-app's `remoteEntry.js` — it creates the SDK and makes calls. In Module Federation, this file is part of the mini-app's webpack build and exposed as a remote module.

```typescript
// mini-app-entry.ts
import { MiniAppSdk } from "./sdk";

const sdk = new MiniAppSdk({ moduleId: "my-mini-app" });
await sdk.initialize();

console.log("[MiniApp] Connected!");

// Make a request to the host
const user = await sdk.auth.getUser();
console.log("[MiniApp] User:", user);

// Listen for events pushed by the host
sdk.on("notification.received", (payload) => {
  console.log("[MiniApp] Event received:", payload);
});

export { sdk }; // optionally expose for direct access
```

**How it connects**: The mini-app (a webpack remote) calls `sdk.initialize()` which sends a `handshake` message via `window.postMessage` and waits for a response from the host's message listener.

---

## 9. The Host Shell (`host-shell.ts`)

This runs in the host application. It sets up a `message` listener, responds to handshakes and requests, and can push events to any loaded mini-app.

```typescript
// host-shell.ts
import { createMessage, isPlatformMessage } from "./utils";

const SDK_CHANNEL = "my-sdk-channel";

// Registry of loaded mini-app moduleIds
const connectedApps = new Set<string>();

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!isPlatformMessage(msg)) return;
  if (msg.channel !== SDK_CHANNEL) return;

  console.log("[Host] received:", msg);

  if (msg.type === "handshake") {
    connectedApps.add(msg.source);
    console.log(`[Host] Mini-app connected: ${msg.source}`);

    // Respond with the same ID to resolve the SDK's pending handshake promise
    const response = createMessage("response", "handshake", "", "shell", msg.source, {
      status: "ok",
    });
    // Override the ID to match the request
    response.id = msg.id;
    response.traceId = msg.traceId;
    window.postMessage(response, "*");
    return;
  }

  if (msg.type === "request") {
    const result = handleRequest(msg.namespace, msg.action, msg.payload);

    const response = createMessage("response", msg.namespace, msg.action, "shell", msg.source, result);
    response.id = msg.id;
    response.traceId = msg.traceId;
    window.postMessage(response, "*");
  }
});

function handleRequest(namespace: string, action: string, payload: unknown) {
  switch (`${namespace}.${action}`) {
    case "auth.getUser":
      return { id: "42", name: "Alice", email: "alice@example.com" };
    case "auth.isAuthenticated":
      return true;
    default:
      console.warn("[Host] Unknown request:", namespace, action);
      return null;
  }
}

// Example: push an event to a specific mini-app
export function sendEventToMiniApp(
  targetModuleId: string,
  namespace: string,
  action: string,
  payload: unknown
) {
  const msg = createMessage("event", namespace, action, "shell", targetModuleId, payload);
  window.postMessage(msg, "*");
}

// Example: push an event after a mini-app connects
setTimeout(() => {
  if (connectedApps.has("my-mini-app")) {
    sendEventToMiniApp("my-mini-app", "notification", "received", {
      title: "Welcome!",
      body: "Your mini-app is connected via Module Federation.",
    });
  }
}, 3000);
```

---

## 10. package.json & tsconfig.json

```json
{
  "name": "my-mini-app-sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

---

## 11. Module Federation: How to Wire It Up

### Host webpack config

```javascript
// webpack.config.js (host)
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "host",
      remotes: {
        "mini-app": "mini_app@http://localhost:3001/remoteEntry.js",
      },
      shared: {
        // If mini-app and host share the SDK package:
        // "my-mini-app-sdk": { singleton: true, strictVersion: false },
      },
    }),
  ],
};
```

### Mini-app webpack config

```javascript
// webpack.config.js (mini-app)
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: "mini_app",
      filename: "remoteEntry.js",
      exposes: {
        "./app": "./src/mini-app-entry.ts",
      },
    }),
  ],
};
```

### Host loads the mini-app at runtime

```typescript
// host loads mini-app at runtime
const container = await import("mini-app/./app");
const { sdk } = container;

// SDK's initialize() sends handshake → host's listener responds → hello world works
```

### How to Test It

1. Start the host dev server (`localhost:3000`) and mini-app dev server (`localhost:3001`)
2. Host loads mini-app via `container.import("mini-app/./app")`
3. Mini-app calls `sdk.initialize()` → `window.postMessage({handshake})` → host listener receives it → sends `response` back
4. Host console shows:

   ```
   [Host] received: {type: "handshake", source: "my-mini-app", ...}
   [Host] Mini-app connected: my-mini-app
   [Host] received: {type: "request", namespace: "auth", action: "getUser", ...}
   ```

5. Mini-app console shows:

   ```
   [MiniApp] Connected!
   [MiniApp] User: { id: "42", name: "Alice", email: "alice@example.com" }
   ```

---

## 12. What Proves "It's Working"

| Signal | Meaning |
|---|---|
| Handshake completes without timeout | Host listened, received message, sent response back |
| `auth.getUser()` returns `{ id, name, email }` | Request/response round-trip works |
| Host can send an event and mini-app receives it | Push (event) pattern works |
| The `id` in request matches `id` in response | Correlation (pending promise resolution) works |

---

## 13. Module Federation: Specific Concerns & Gotchas

| Concern | Why it matters | How to handle |
|---|---|---|
| **SDK as a shared singleton** | If host and mini-app both bundle the SDK, you'll have two separate `message` listeners and double-processing | Make the SDK a `shared` module in webpack config: `{ singleton: true }` — ensures one instance of the transport's message listener |
| **Channel collision** | Other code on the page might use `postMessage` with similar message shapes | Always check `channel` in both the SDK and host listener (`msg.channel === SDK_CHANNEL`) |
| **Self-loop** | `window.postMessage` fires on same window — SDK sees its own messages | Already handled: request → target `"shell"` → SDK drops it; response → target `moduleId` → SDK picks it up |
| **Shadow DOM / micro-frontend isolation** | If mini-apps are mounted in shadow roots, `window` is still shared | SDK uses `window.postMessage` which always goes to the main window — no change needed |
| **Host listener registration timing** | SDK's `initialize()` sends handshake immediately — host must be listening before the mini-app mounts | Set up the host's `message` listener in the shell's bootstrap code, before `container.import(...)` |
| **Mini-app unmount** | When a remote app is unmounted, clean up its SDK instance | Call `sdk.destroy()` in the mini-app's cleanup/unmount hook — removes its message listener and clears pending promises |
| **Module ID uniqueness** | Multiple mini-apps need distinct `moduleId`s to receive correct responses | Generate or configure unique moduleIds per mini-app instance (can use the remote name + instance counter) |

---

## 14. From Here — What to Add Next

| Feature | What it enables | Reference in this SDK |
|---|---|---|
| Error handling / `SdkError` class | Structured errors, retry logic | `src/errors.ts` |
| Timeout & retry config | Production robustness | `SdkTransport` constructor options |
| Module system (device, http, navigation) | Organized API surface | `sdk.ts` module factories |
| TypeScript types for each module | IDE autocomplete, safety | `src/types.ts` |
| Event subscription with host awareness | Host knows which mini-apps listen to which events | `transport.ts` → `request("event", "subscribe", ...)` |
| Multi-instance support | Registry to manage multiple mini-app SDKs on same page | `src/cdn.ts` |
