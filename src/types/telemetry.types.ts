import type { PlatformTypeLiteral } from './common.types';

export type TelemetryLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface TelemetrySdkModule {
  log(level: TelemetryLogLevel, message: string, context?: Record<string, unknown>): void;
  track(event: string, properties?: Record<string, unknown>): void;
  error(error: string | Error, context?: Record<string, unknown>): void;
}

export interface PlatformSdkModule {
  readonly type: PlatformTypeLiteral;
  isWeb(): boolean;
  isAndroid(): boolean;
  isIOS(): boolean;
  isMobile(): boolean;
}
