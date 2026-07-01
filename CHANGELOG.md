# @lizuzsusil/mini-app-sdk

## 2.0.0 (2026-07-01)

### Breaking Changes

- **Unified transport protocol**: Removed all Flutter-specific code paths (`__GOV_FLUTTER_BRIDGE__` detection, `govFlutterCallback` wrapping, dual-mode architecture). The SDK now uses a single universal protocol:
  - **Outbound**: `window.parent.postMessage(msg, '*')`
  - **Inbound**: `message` event and `gov-platform-event` custom event
- **Removed exports**: `FLUTTER_BRIDGE_KEY`, `FlutterBridge` (type), `TransportMode` (type)
- **Removed methods**: `SdkTransport.getMode()`, `SdkTransport.getFlutterPlatform()`
- **Protocol version**: Bumped from `1.0.0` to `2.0.0`

### Migration

Flutter host applications must now inject a `parent.postMessage` interceptor before loading the mini-app. See `Messaging_Architecture.md` for the Flutter WebView integration guide.

### What's unchanged

All mini-app-facing APIs — `auth`, `permissions`, `flags`, `config`, `navigation`, `telemetry`, `platform`, `device`, `http` modules, event subscription via `on()`, and `initialize()`/`destroy()` — remain identical.
