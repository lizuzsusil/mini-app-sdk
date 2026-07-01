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

export type EventHandler = (payload: unknown) => void;

export interface HttpGetParams {
  endpoint: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface HttpPostParams {
  endpoint: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpPutParams {
  endpoint: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpPatchParams {
  endpoint: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpDeleteParams {
  endpoint: string;
  headers?: Record<string, string>;
}

export interface HttpResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

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
  get<T = unknown>(endpoint: string, query?: Record<string, string>, headers?: Record<string, string>): Promise<HttpResult<T>>;
  post<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  put<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  patch<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  delete<T = unknown>(endpoint: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
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

export interface MiniAppSdkOptions {
  moduleId: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}
