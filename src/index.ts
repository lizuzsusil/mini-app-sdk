/* Mini App SDK — self-contained, event-based communication with the host shell.
 * Mini apps MUST use this SDK for all platform interactions.
 * No dependency on host packages. */

// ── Message protocol types ──────────────────────────────────────────────

export interface PlatformError {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export interface PlatformMessage {
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

export type EventHandler = (payload: unknown) => void;

// ── HTTP types ──────────────────────────────────────────────────────────

export interface HttpGetParams {
  endpoint: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface HttpResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

// ── SDK module types ────────────────────────────────────────────────────

export interface AuthSdkModule {
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;
}

export interface PermissionsSdkModule {
  has(permission: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export interface FlagsSdkModule {
  isEnabled(flag: string): Promise<boolean>;
  getAll(): Promise<Record<string, boolean>>;
}

export interface ConfigSdkModule {
  get<T = unknown>(key: string): Promise<T | undefined>;
  getAll(): Promise<Record<string, unknown>>;
}

export interface NavigationSdkModule {
  navigate(target: NavigationTarget): Promise<void>;
  getCurrent(): Promise<NavigationState>;
}

export interface TelemetrySdkModule {
  log(level: string, message: string, context?: Record<string, unknown>): void;
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

export interface DeviceSdkModule {
  location(options?: Record<string, unknown>): Promise<DeviceLocationResult>;
  camera(options?: Record<string, unknown>): Promise<DeviceCameraResult>;
  gallery(options?: Record<string, unknown>): Promise<DeviceGalleryResult>;
  files(options?: Record<string, unknown>): Promise<DeviceFilesResult>;
  biometric(options?: Record<string, unknown>): Promise<DeviceBiometricResult>;
  notifications(options?: Record<string, unknown>): Promise<DeviceNotificationResult>;
  network(): Promise<DeviceNetworkResult>;
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  info(): Promise<DeviceInfoResult>;
}

export interface HttpSdkModule {
  get<T = unknown>(endpoint: string, query?: Record<string, string>): Promise<HttpResult<T>>;
}

export interface MiniAppSdkInterface {
  readonly moduleId: string;
  readonly version: string;
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
  initialize(): Promise<void>;
  destroy(): void;
  on(event: string, handler: EventHandler): () => void;
}

// ── Data types ──────────────────────────────────────────────────────────

export type PlatformTypeLiteral = 'WEB' | 'ANDROID' | 'IOS';

export interface PlatformUser {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  nationalId?: string;
  roles: string[];
  permissions: string[];
  avatar?: string;
}

export interface NavigationTarget {
  app: string;
  route: string;
  params?: Record<string, string>;
  replace?: boolean;
}

export interface NavigationState {
  current: string;
  history: string[];
}

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface DeviceCameraResult {
  uri: string;
  base64?: string;
  width?: number;
  height?: number;
}

export interface DeviceGalleryResult {
  uris: string[];
}

export interface DeviceFilesResult {
  uris: string[];
  names: string[];
}

export interface DeviceBiometricResult {
  success: boolean;
  error?: string;
}

export interface DeviceNotificationResult {
  enabled: boolean;
  token?: string;
}

export interface DeviceNetworkResult {
  online: boolean;
  type?: 'wifi' | 'cellular' | 'none';
  effectiveType?: string;
}

export interface DeviceInfoResult {
  platform: PlatformTypeLiteral;
  osVersion: string;
  appVersion: string;
  deviceModel?: string;
  screenWidth?: number;
  screenHeight?: number;
}

// ──── SDK options ───────────────────────────────────────────────────

export interface MiniAppSdkOptions {
  moduleId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

// ──── Flutter bridge types ──────────────────────────────────────────

const FLUTTER_BRIDGE_KEY = '__GOV_FLUTTER_BRIDGE__';

interface FlutterBridge {
  postMessage: (message: string) => void;
  platform: 'ANDROID' | 'IOS';
}

declare global {
  interface Window {
    [FLUTTER_BRIDGE_KEY]?: FlutterBridge;
    govFlutterCallback?: (response: string) => void;
  }
}

type TransportMode = 'web' | 'flutter';

// ──── SdkError ──────────────────────────────────────────────────────

export class SdkError extends Error {
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;

  constructor(error: PlatformError) {
    super(error.message);
    this.name = 'SdkError';
    this.code = error.code;
    this.retryable = error.retryable ?? false;
    this.details = error.details;
  }
}

// ──── Constants & helpers ───────────────────────────────────────────

const PROTOCOL_VERSION = '1.0.0';
const PLATFORM_EVENT_NAME = 'gov-platform-event';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MESSAGE_CHANNEL = 'gov-platform-sdk';

function createMessage(
  type: PlatformMessage['type'],
  method: string,
  source: string,
  target: string,
  payload?: unknown,
  extra?: { id?: string; traceId?: string; version?: string; error?: PlatformError }
): PlatformMessage {
  return {
    channel: MESSAGE_CHANNEL,
    id: extra?.id ?? generateId(),
    type,
    method,
    source,
    target,
    version: extra?.version ?? PROTOCOL_VERSION,
    payload,
    error: extra?.error,
    traceId: extra?.traceId ?? generateId(),
    timestamp: Date.now(),
  };
}

function isPlatformMessage(data: unknown): data is PlatformMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return typeof msg.id === 'string' && typeof msg.type === 'string' && typeof msg.method === 'string';
}

// ──── SDK transport — pure event-based communication ────────────────

class SdkTransport {
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private customEventListener: ((event: Event) => void) | null = null;
  private readonly timeout: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;
  private readonly moduleId: string;
  private traceId: string;
  private mode: TransportMode = 'web';
  private flutterBridge: FlutterBridge | null = null;
  private originalFlutterCallback: ((response: string) => void) | undefined;

  constructor(moduleId: string, options: { timeout?: number; retryAttempts?: number; retryDelayMs?: number }) {
    this.moduleId = moduleId;
    this.timeout = options.timeout ?? 10000;
    this.retryAttempts = options.retryAttempts ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.traceId = generateId();
  }

  start(): void {
    const bridge = typeof window !== 'undefined' ? window[FLUTTER_BRIDGE_KEY] : undefined;
    if (bridge) {
      this.mode = 'flutter';
      this.flutterBridge = bridge;

      this.originalFlutterCallback = window.govFlutterCallback;
      window.govFlutterCallback = (responseJson: string) => {
        this.originalFlutterCallback?.(responseJson);
        try {
          const msg = JSON.parse(responseJson) as PlatformMessage;
          if (isPlatformMessage(msg)) {
            this.handleIncomingMessage(msg);
          }
        } catch {
          // ignore malformed messages from other sources
        }
      };
      return;
    }

    this.messageListener = (event: MessageEvent) => {
      if (!isPlatformMessage(event.data)) return;
      this.handleIncomingMessage(event.data);
    };
    window.addEventListener('message', this.messageListener);

    this.customEventListener = (event: Event) => {
      const msg = (event as CustomEvent<PlatformMessage>).detail;
      if (!isPlatformMessage(msg)) return;
      this.handleIncomingMessage(msg);
    };
    window.addEventListener(PLATFORM_EVENT_NAME, this.customEventListener);
  }

  stop(): void {
    if (this.mode === 'flutter') {
      if (this.originalFlutterCallback) {
        window.govFlutterCallback = this.originalFlutterCallback;
      } else {
        delete window.govFlutterCallback;
      }
      this.flutterBridge = null;
      this.originalFlutterCallback = undefined;
      this.mode = 'web';
    } else {
      if (this.messageListener) window.removeEventListener('message', this.messageListener);
      if (this.customEventListener) window.removeEventListener(PLATFORM_EVENT_NAME, this.customEventListener);
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('Transport stopped'));
    }
    this.pending.clear();
    this.eventHandlers.clear();
  }

  getMode(): TransportMode {
    return this.mode;
  }

  getFlutterPlatform(): 'ANDROID' | 'IOS' | null {
    return this.flutterBridge?.platform ?? null;
  }

  private handleIncomingMessage(msg: PlatformMessage): void {
    if (msg.target !== this.moduleId && msg.target !== '*') return;

    if (msg.type === 'response') {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new SdkError(msg.error));
        } else {
          pending.resolve(msg.payload);
        }
      }
    }

    if (msg.type === 'event') {
      const handlers = this.eventHandlers.get(msg.method);
      handlers?.forEach((h) => h(msg.payload));
    }
  }

  async request<T>(method: string, payload?: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.sendRequest<T>(method, payload);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof SdkError && !err.retryable) throw err;
        if (attempt < this.retryAttempts) {
          await delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  private sendRequest<T>(method: string, payload?: unknown): Promise<T> {
    const msg = createMessage('request', method, this.moduleId, 'shell', payload, {
      traceId: this.traceId,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new SdkError({ code: 'TIMEOUT', message: `Request ${method} timed out`, retryable: true }));
      }, this.timeout);

      this.pending.set(msg.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.sendMessage(msg);
    });
  }

  private sendMessage(msg: PlatformMessage): void {
    if (this.mode === 'flutter' && this.flutterBridge) {
      this.flutterBridge.postMessage(JSON.stringify(msg));
    } else {
      window.parent.postMessage(msg, '*');
    }
  }

  async handshake(): Promise<void> {
    const msg = createMessage('handshake', 'handshake', this.moduleId, 'shell', {
      moduleId: this.moduleId,
      sdkVersion: PROTOCOL_VERSION,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error('Handshake timed out'));
      }, this.timeout);

      this.pending.set(msg.id, {
        resolve: () => resolve(),
        reject,
        timer,
      });

      this.sendMessage(msg);
    });
  }

  onEvent(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }

  getTraceId(): string {
    return this.traceId;
  }
}

// ──── MiniAppSdk ────────────────────────────────────────────────────

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
  private platformType: PlatformTypeLiteral = 'WEB';
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
    if (this.transport.getMode() === 'flutter') {
      this.platformType = this.transport.getFlutterPlatform() ?? 'ANDROID';
    } else {
      this.platformType = await this.transport.request<PlatformTypeLiteral>('platform.getType');
    }
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
      this.transport.request('event.subscribe', { eventType: event }).catch(() => {});
    }
    this.eventHandlers.get(event)!.add(handler);
    const transportUnsub = this.transport.onEvent(event, handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
      transportUnsub();
    };
  }

  private createAuthModule(): AuthSdkModule {
    return {
      getUser: () => this.transport.request<PlatformUser | null>('auth.getUser'),
      isAuthenticated: () => this.transport.request<boolean>('auth.isAuthenticated'),
      logout: () => this.transport.request<void>('auth.logout'),
    };
  }

  private createPermissionsModule(): PermissionsSdkModule {
    return {
      has: (permission) => this.transport.request<boolean>('permissions.has', { permission }),
      list: () => this.transport.request<string[]>('permissions.list'),
    };
  }

  private createFlagsModule(): FlagsSdkModule {
    return {
      isEnabled: (flag) => this.transport.request<boolean>('flags.isEnabled', { flag }),
      getAll: () => this.transport.request<Record<string, boolean>>('flags.getAll'),
    };
  }

  private createConfigModule(): ConfigSdkModule {
    return {
      get: <T = unknown>(key: string) => this.transport.request<T | undefined>('config.get', { key }),
      getAll: () => this.transport.request<Record<string, unknown>>('config.getAll'),
    };
  }

  private createNavigationModule(): NavigationSdkModule {
    return {
      navigate: (target: NavigationTarget) => this.transport.request<void>('navigation.navigate', target),
      getCurrent: () => this.transport.request<NavigationState>('navigation.getCurrent'),
    };
  }

  private createTelemetryModule(): TelemetrySdkModule {
    return {
      log: (level, message, context) => {
        this.transport.request('telemetry.log', { level, message, context }).catch(() => {});
      },
      track: (event, properties) => {
        this.transport.request('telemetry.track', { event, properties }).catch(() => {});
      },
      error: (error, context) => {
        const message = error instanceof Error ? error.message : error;
        this.transport.request('telemetry.error', { message, context }).catch(() => {});
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
      location: (options) => this.transport.request<DeviceLocationResult>('device.location', options),
      camera: (options) => this.transport.request<DeviceCameraResult>('device.camera', options),
      gallery: (options) => this.transport.request<DeviceGalleryResult>('device.gallery', options),
      files: (options) => this.transport.request<DeviceFilesResult>('device.files', options),
      biometric: (options) => this.transport.request<DeviceBiometricResult>('device.biometric', options),
      notifications: (options) => this.transport.request<DeviceNotificationResult>('device.notifications', options),
      network: () => this.transport.request<DeviceNetworkResult>('device.network'),
      storage: {
        get: (key) =>
          this.transport.request<{ value: string | null }>('device.storage', { action: 'get', key }).then((r) => r?.value ?? null),
        set: (key, value) => this.transport.request('device.storage', { action: 'set', key, value }),
        remove: (key) => this.transport.request('device.storage', { action: 'remove', key }),
      },
      info: () => this.transport.request<DeviceInfoResult>('device.info'),
    };
  }

  private createHttpModule(): HttpSdkModule {
    return {
      get: <T = unknown>(endpoint: string, query?: Record<string, string>) =>
        this.transport.request<HttpResult<T>>('http.get', { endpoint, query } as HttpGetParams),
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
