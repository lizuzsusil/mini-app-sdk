# mini-app-sdk

Framework-agnostic Mini App SDK for vendor mini apps. Event-based communication with the host shell.

## Features

- **Framework-agnostic**: Core SDK works with any framework or vanilla JS
- **React integration**: First-class React hooks and provider
- **Event-based protocol**: Request/response, events, and handshake messaging
- **Cross-platform**: Works on Web, Android (Flutter), and iOS (Flutter)
- **Type-safe**: Full TypeScript support with comprehensive types

## Installation

```bash
pnpm add mini-app-sdk
# or
npm install mini-app-sdk
```

Peer dependency (optional, for React integration):
```bash
pnpm add react@>=16.8.0
```

## Quick Start

### Core SDK (Vanilla JS / Any Framework)

```typescript
import { initMiniAppSdk, MiniAppSdkOptions } from 'mini-app-sdk';

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

### React Integration

```tsx
import { MiniAppSdkProvider, useMiniAppSdk, usePlatformUser } from 'mini-app-sdk/react';

function App() {
  return (
    <MiniAppSdkProvider moduleId="my-mini-app" fallback={<Loading />}>
      <Dashboard />
    </MiniAppSdkProvider>
  );
}

function Dashboard() {
  const sdk = useMiniAppSdk();
  const user = usePlatformUser();

  const handleNavigate = async () => {
    await sdk.navigation.navigate({
      app: 'settings',
      route: '/profile',
    });
  };

  return (
    <div>
      <h1>Welcome, {user?.name}</h1>
      <button onClick={handleNavigate}>Go to Settings</button>
    </div>
  );
}
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
| `http` | HTTP requests: `get()` |

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
4. **Transport**: Auto-detects Web (postMessage) or Flutter (native bridge)

### Message Protocol

```typescript
interface PlatformMessage {
  channel: string;
  id: string;
  type: 'request' | 'response' | 'event' | 'handshake';
  method: string;
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

# Watch mode
pnpm dev

# Clean
pnpm clean
```

## License

MIT