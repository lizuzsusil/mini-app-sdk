# @lizuzsusil/mini-app-sdk

Framework-agnostic Mini App SDK for vendor mini apps. Event-based communication with the host shell.

## Features

- **Framework-agnostic**: Core SDK works with any framework or vanilla JS
- **Event-based protocol**: Request/response, events, and handshake messaging
- **Cross-platform**: Works on Web, Android (Flutter), and iOS (Flutter)
- **Type-safe**: Full TypeScript support with comprehensive types

## Installation

```bash
pnpm add @lizuzsusil/mini-app-sdk
# or
npm install @lizuzsusil/mini-app-sdk
```

## CDN Usage

The minified browser build is served from GitHub via jsDelivr CDN. After creating a `vX.Y.Z` tag, the GitHub Actions workflow builds `dist/`, commits it to the tag, and purges the jsDelivr cache.

```html
<script src="https://cdn.jsdelivr.net/gh/lizuzsusil/mini-app-sdk@v2.0.0/dist/mini-app-sdk.min.js"></script>
```

The script build exposes the SDK on `window.MiniAppSdk`:

```html
<script>
  MiniAppSdk.initMiniAppSdk({
    moduleId: 'my-mini-app',
    timeout: 10000,
  }).then((sdk) => {
    // SDK is ready.
  });
</script>
```

For browser ESM imports, use the compiled module file:

```js
import { initMiniAppSdk } from 'https://cdn.jsdelivr.net/gh/lizuzsusil/mini-app-sdk@v2.0.0/dist/index.mjs';
```

Use an exact version in production CDN links so published mini apps keep loading the same code. After each release, update the version segment in the URL.

## Quick Start

### Core SDK (Vanilla JS / Any Framework)

```typescript
import { initMiniAppSdk, type MiniAppSdkOptions } from '@lizuzsusil/mini-app-sdk';

const options: MiniAppSdkOptions = {
  moduleId: 'my-mini-app',
  timeout: 10000,
  retryAttempts: 2,
  retryDelayMs: 500,
};

const sdk = await initMiniAppSdk(options);

// Use any module
const user = await sdk.auth.getUser();
const hasPermission = await sdk.permissions.has('camera');
const location = await sdk.device.location({ highAccuracy: true });

// Listen to platform events
const unsubscribe = sdk.on('notification.received', (payload) => {
  console.log('Notification:', payload);
});

// Cleanup
sdk.destroy();
```

## API Reference

### Core Modules

| Module | Description |
|--------|-------------|
| `auth` | User authentication: `getUser()`, `isAuthenticated()`, `logout()` |
| `permissions` | Permission checks: `has()`, `list()` |
| `flags` | Feature flags: `isEnabled()`, `getAll()` |
| `config` | Configuration: `get()`, `getAll()` |
| `navigation` | Navigation: `navigate()`, `getCurrent()` |
| `telemetry` | Logging & analytics: `log()`, `track()`, `error()` |
| `platform` | Platform detection: `type`, `isWeb()`, `isAndroid()`, `isIOS()`, `isMobile()` |
| `device` | Device APIs: `location()`, `camera()`, `gallery()`, `files()`, `biometric()`, `notifications()`, `network()`, `storage`, `info()` |
| `http` | HTTP requests: `get()`, `post()`, `put()`, `patch()`, `delete()` |

### Types

All TypeScript types are exported:
- `PlatformUser`, `NavigationTarget`, `NavigationState`
- `DeviceLocationResult`, `DeviceCameraResult`, etc.
- `MiniAppSdkInterface`, `MiniAppSdkOptions`
- `SdkError` (error class with `code`, `retryable`, `details`)

## How It Works

The SDK communicates with the host shell via **event-based messaging**:

1. **Handshake**: Establishes connection on initialization
2. **Request/Response**: Method calls with payloads and async responses
3. **Events**: Subscribe to platform events (notifications, config changes, etc.)
4. **Transport**: Universal `postMessage` / `message` event protocol for all environments

### Message Protocol

```typescript
interface PlatformMessage {
  channel: string;
  id: string;
  type: 'request' | 'response' | 'event' | 'handshake';
  namespace: string;
  action: string;
  source: string;
  target: string;
  version: string;
  payload?: unknown;
  error?: PlatformError;
  traceId: string;
  timestamp: number;
}
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Inspect files that will be published
pnpm pack --dry-run

# Publish public scoped package to npm
npm publish --access public

# Watch mode
pnpm dev

# Clean
pnpm clean
```

## License

MIT
