import type {
  AuthSdkModule,
  ConfigSdkModule,
  DeviceSdkModule,
  EventHandler,
  FlagsSdkModule,
  HttpGetParams,
  HttpPostParams,
  HttpPutParams,
  HttpPatchParams,
  HttpDeleteParams,
  HttpResult,
  HttpSdkModule,
  MiniAppSdkInterface,
  MiniAppSdkOptions,
  NavigationSdkModule,
  NavigationTarget,
  NavigationState,
  PermissionsSdkModule,
  PlatformSdkModule,
  PlatformTypeLiteral,
  PlatformUser,
  TelemetrySdkModule,
  DeviceLocationResult,
  DeviceCameraResult,
  DeviceGalleryResult,
  DeviceFilesResult,
  DeviceBiometricResult,
  DeviceNotificationResult,
  DeviceNetworkResult,
  DeviceInfoResult,
} from './types';
import { PROTOCOL_VERSION } from './constants';
import { SdkTransport } from './transport';

export class MiniAppSdk implements MiniAppSdkInterface {
  readonly moduleId: string;
  readonly version = PROTOCOL_VERSION;
  readonly traceId: string;

  auth: AuthSdkModule;
  permissions: PermissionsSdkModule;
  flags: FlagsSdkModule;
  config: ConfigSdkModule;
  navigation: NavigationSdkModule;
  telemetry: TelemetrySdkModule;
  platform: PlatformSdkModule;
  device: DeviceSdkModule;
  http: HttpSdkModule;

  private transport: SdkTransport;
  private initialized = false;
  private eventHandlers = new Map<string, Set<EventHandler>>();

  constructor(options: MiniAppSdkOptions) {
    this.moduleId = options.moduleId;
    this.transport = new SdkTransport(options.moduleId, options);
    this.traceId = this.transport.getTraceId();

    this.auth = this.createAuthModule();
    this.permissions = this.createPermissionsModule();
    this.flags = this.createFlagsModule();
    this.config = this.createConfigModule();
    this.navigation = this.createNavigationModule();
    this.telemetry = this.createTelemetryModule();
    this.platform = this.createPlatformModule();
    this.device = this.createDeviceModule();
    this.http = this.createHttpModule();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.transport.start();
    await this.transport.handshake();
    this.platformType = await this.transport.request<PlatformTypeLiteral>('platform', 'getType');
    this.initialized = true;
  }

  destroy(): void {
    this.transport.stop();
    this.eventHandlers.clear();
    this.initialized = false;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
      this.transport.request('event', 'subscribe', { eventType: event }).catch(() => {});
    }
    this.eventHandlers.get(event)!.add(handler);
    const transportUnsub = this.transport.onEvent(event, handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
      transportUnsub();
    };
  }

  // platform module needs access to the mutable platformType
  private platformType: PlatformTypeLiteral = 'WEB';

  private createAuthModule(): AuthSdkModule {
    return {
      getUser: () => this.transport.request<PlatformUser | null>('auth', 'getUser'),
      isAuthenticated: () => this.transport.request<boolean>('auth', 'isAuthenticated'),
      logout: () => this.transport.request<void>('auth', 'logout'),
    };
  }

  private createPermissionsModule(): PermissionsSdkModule {
    return {
      has: (permission) => this.transport.request<boolean>('permissions', 'has', { permission }),
      list: () => this.transport.request<string[]>('permissions', 'list'),
    };
  }

  private createFlagsModule(): FlagsSdkModule {
    return {
      isEnabled: (flag) => this.transport.request<boolean>('flags', 'isEnabled', { flag }),
      getAll: () => this.transport.request<Record<string, boolean>>('flags', 'getAll'),
    };
  }

  private createConfigModule(): ConfigSdkModule {
    return {
      get: <T = unknown>(key: string) => this.transport.request<T | undefined>('config', 'get', { key }),
      getAll: () => this.transport.request<Record<string, unknown>>('config', 'getAll'),
    };
  }

  private createNavigationModule(): NavigationSdkModule {
    return {
      navigate: (target: NavigationTarget) => this.transport.request<void>('navigation', 'navigate', target),
      getCurrent: () => this.transport.request<NavigationState>('navigation', 'getCurrent'),
    };
  }

  private createTelemetryModule(): TelemetrySdkModule {
    return {
      log: (level, message, context) => {
        this.transport.request('telemetry', 'log', { level, message, context }).catch(() => {});
      },
      track: (event, properties) => {
        this.transport.request('telemetry', 'track', { event, properties }).catch(() => {});
      },
      error: (error, context) => {
        const message = error instanceof Error ? error.message : error;
        this.transport.request('telemetry', 'error', { message, context }).catch(() => {});
      },
    };
  }

  private createPlatformModule(): PlatformSdkModule {
    const self = this;
    return {
      get type() {
        return self.platformType;
      },
      isWeb: () => self.platformType === 'WEB',
      isAndroid: () => self.platformType === 'ANDROID',
      isIOS: () => self.platformType === 'IOS',
      isMobile: () => self.platformType !== 'WEB',
    };
  }

  private createDeviceModule(): DeviceSdkModule {
    return {
      location: (options) => this.transport.request<DeviceLocationResult>('device', 'location', options),
      camera: (options) => this.transport.request<DeviceCameraResult>('device', 'camera', options),
      gallery: (options) => this.transport.request<DeviceGalleryResult>('device', 'gallery', options),
      files: (options) => this.transport.request<DeviceFilesResult>('device', 'files', options),
      biometric: (options) => this.transport.request<DeviceBiometricResult>('device', 'biometric', options),
      notifications: (options) => this.transport.request<DeviceNotificationResult>('device', 'notifications', options),
      network: () => this.transport.request<DeviceNetworkResult>('device', 'network'),
      storage: {
        get: (key) =>
          this.transport.request<{ value: string | null }>('device', 'storage', { action: 'get', key }).then((r) => r?.value ?? null),
        set: (key, value) => this.transport.request('device', 'storage', { action: 'set', key, value }),
        remove: (key) => this.transport.request('device', 'storage', { action: 'remove', key }),
      },
      info: () => this.transport.request<DeviceInfoResult>('device', 'info'),
    };
  }

  private createHttpModule(): HttpSdkModule {
    return {
      get: <T = unknown>(endpoint: string, query?: Record<string, string>, headers?: Record<string, string>) =>
        this.transport.request<HttpResult<T>>('http', 'get', { endpoint, query, headers } as HttpGetParams),
      post: <T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>) =>
        this.transport.request<HttpResult<T>>('http', 'post', { endpoint, body, headers } as HttpPostParams),
      put: <T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>) =>
        this.transport.request<HttpResult<T>>('http', 'put', { endpoint, body, headers } as HttpPutParams),
      patch: <T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>) =>
        this.transport.request<HttpResult<T>>('http', 'patch', { endpoint, body, headers } as HttpPatchParams),
      delete: <T = unknown>(endpoint: string, headers?: Record<string, string>) =>
        this.transport.request<HttpResult<T>>('http', 'delete', { endpoint, headers } as HttpDeleteParams),
    };
  }
}

let globalSdk: MiniAppSdk | null = null;

export function createMiniAppSdk(options: MiniAppSdkOptions): MiniAppSdk {
  return new MiniAppSdk(options);
}

export function getMiniAppSdk(): MiniAppSdk {
  if (!globalSdk) {
    throw new Error('Mini App SDK not initialized. Call initMiniAppSdk() first.');
  }
  return globalSdk;
}

export async function initMiniAppSdk(options: MiniAppSdkOptions): Promise<MiniAppSdk> {
  globalSdk = new MiniAppSdk(options);
  await globalSdk.initialize();
  return globalSdk;
}
