import type { FlutterBridge } from './types';

export const FLUTTER_BRIDGE_KEY = '__GOV_FLUTTER_BRIDGE__';
export const PROTOCOL_VERSION = '1.0.0';
export const PLATFORM_EVENT_NAME = 'gov-platform-event';
export const MESSAGE_CHANNEL = 'gov-platform-sdk';

declare global {
  interface Window {
    [FLUTTER_BRIDGE_KEY]?: FlutterBridge;
    govFlutterCallback?: (response: string) => void;
  }
}
