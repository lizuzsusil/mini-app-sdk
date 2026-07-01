interface PlatformError {
    code: string;
    message: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
}
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
type EventHandler = (payload: unknown) => void;
interface HttpGetParams {
    endpoint: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
}
interface HttpPostParams {
    endpoint: string;
    body?: unknown;
    headers?: Record<string, string>;
}
interface HttpPutParams {
    endpoint: string;
    body?: unknown;
    headers?: Record<string, string>;
}
interface HttpPatchParams {
    endpoint: string;
    body?: unknown;
    headers?: Record<string, string>;
}
interface HttpDeleteParams {
    endpoint: string;
    headers?: Record<string, string>;
}
interface HttpResult<T = unknown> {
    status: number;
    data: T;
    headers: Record<string, string>;
}
interface AuthSdkModule {
    getUser(): Promise<PlatformUser | null>;
    isAuthenticated(): Promise<boolean>;
    logout(): Promise<void>;
}
interface PermissionsSdkModule {
    has(permission: string): Promise<boolean>;
    list(): Promise<string[]>;
}
interface FlagsSdkModule {
    isEnabled(flag: string): Promise<boolean>;
    getAll(): Promise<Record<string, boolean>>;
}
interface ConfigSdkModule {
    get<T = unknown>(key: string): Promise<T | undefined>;
    getAll(): Promise<Record<string, unknown>>;
}
interface NavigationSdkModule {
    navigate(target: NavigationTarget): Promise<void>;
    getCurrent(): Promise<NavigationState>;
}
interface TelemetrySdkModule {
    log(level: string, message: string, context?: Record<string, unknown>): void;
    track(event: string, properties?: Record<string, unknown>): void;
    error(error: string | Error, context?: Record<string, unknown>): void;
}
interface PlatformSdkModule {
    readonly type: PlatformTypeLiteral;
    isWeb(): boolean;
    isAndroid(): boolean;
    isIOS(): boolean;
    isMobile(): boolean;
}
interface DeviceSdkModule {
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
interface HttpSdkModule {
    get<T = unknown>(endpoint: string, query?: Record<string, string>, headers?: Record<string, string>): Promise<HttpResult<T>>;
    post<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
    put<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
    patch<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
    delete<T = unknown>(endpoint: string, headers?: Record<string, string>): Promise<HttpResult<T>>;
}
interface MiniAppSdkInterface {
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
type PlatformTypeLiteral = 'WEB' | 'ANDROID' | 'IOS';
interface PlatformUser {
    id: string;
    name: string;
    fullName?: string;
    email: string;
    nationalId?: string;
    roles: string[];
    permissions: string[];
    avatar?: string;
}
interface NavigationTarget {
    app: string;
    route: string;
    params?: Record<string, string>;
    replace?: boolean;
}
interface NavigationState {
    current: string;
    history: string[];
}
interface DeviceLocationResult {
    latitude: number;
    longitude: number;
    accuracy?: number;
}
interface DeviceCameraResult {
    uri: string;
    base64?: string;
    width?: number;
    height?: number;
}
interface DeviceGalleryResult {
    uris: string[];
}
interface DeviceFilesResult {
    uris: string[];
    names: string[];
}
interface DeviceBiometricResult {
    success: boolean;
    error?: string;
}
interface DeviceNotificationResult {
    enabled: boolean;
    token?: string;
}
interface DeviceNetworkResult {
    online: boolean;
    type?: 'wifi' | 'cellular' | 'none';
    effectiveType?: string;
}
interface DeviceInfoResult {
    platform: PlatformTypeLiteral;
    osVersion: string;
    appVersion: string;
    deviceModel?: string;
    screenWidth?: number;
    screenHeight?: number;
}
interface MiniAppSdkOptions {
    moduleId: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelayMs?: number;
}

declare class SdkError extends Error {
    code: string;
    retryable: boolean;
    details?: Record<string, unknown>;
    constructor(error: PlatformError);
}

declare class MiniAppSdk implements MiniAppSdkInterface {
    readonly moduleId: string;
    readonly version = "2.0.0";
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
    private transport;
    private initialized;
    private eventHandlers;
    constructor(options: MiniAppSdkOptions);
    initialize(): Promise<void>;
    destroy(): void;
    on(event: string, handler: EventHandler): () => void;
    private platformType;
    private createAuthModule;
    private createPermissionsModule;
    private createFlagsModule;
    private createConfigModule;
    private createNavigationModule;
    private createTelemetryModule;
    private createPlatformModule;
    private createDeviceModule;
    private createHttpModule;
}
declare function createMiniAppSdk(options: MiniAppSdkOptions): MiniAppSdk;
declare function getMiniAppSdk(): MiniAppSdk;
declare function initMiniAppSdk(options: MiniAppSdkOptions): Promise<MiniAppSdk>;

declare class SdkTransport {
    private pending;
    private eventHandlers;
    private messageListener;
    private customEventListener;
    private readonly timeout;
    private readonly retryAttempts;
    private readonly retryDelayMs;
    private readonly moduleId;
    private traceId;
    constructor(moduleId: string, options: {
        timeout?: number;
        retryAttempts?: number;
        retryDelayMs?: number;
    });
    start(): void;
    stop(): void;
    private handleIncomingMessage;
    request<T>(namespace: string, action: string, payload?: unknown): Promise<T>;
    private sendRequest;
    private sendMessage;
    handshake(): Promise<void>;
    onEvent(event: string, handler: EventHandler): () => void;
    getTraceId(): string;
}

declare const PROTOCOL_VERSION = "2.0.0";
declare const PLATFORM_EVENT_NAME = "gov-platform-event";
declare const MESSAGE_CHANNEL = "gov-platform-sdk";

declare function generateId(): string;
declare function delay(ms: number): Promise<void>;
declare function createMessage(type: PlatformMessage['type'], namespace: string, action: string, source: string, target: string, payload?: unknown, extra?: {
    id?: string;
    traceId?: string;
    version?: string;
    error?: PlatformMessage['error'];
}): PlatformMessage;
declare function isPlatformMessage(data: unknown): data is PlatformMessage;

export { type AuthSdkModule, type ConfigSdkModule, type DeviceBiometricResult, type DeviceCameraResult, type DeviceFilesResult, type DeviceGalleryResult, type DeviceInfoResult, type DeviceLocationResult, type DeviceNetworkResult, type DeviceNotificationResult, type DeviceSdkModule, type EventHandler, type FlagsSdkModule, type HttpDeleteParams, type HttpGetParams, type HttpPatchParams, type HttpPostParams, type HttpPutParams, type HttpResult, type HttpSdkModule, MESSAGE_CHANNEL, MiniAppSdk, type MiniAppSdkInterface, type MiniAppSdkOptions, type NavigationSdkModule, type NavigationState, type NavigationTarget, PLATFORM_EVENT_NAME, PROTOCOL_VERSION, type PermissionsSdkModule, type PlatformError, type PlatformMessage, type PlatformSdkModule, type PlatformTypeLiteral, type PlatformUser, SdkError, SdkTransport, type TelemetrySdkModule, createMessage, createMiniAppSdk, delay, generateId, getMiniAppSdk, initMiniAppSdk, isPlatformMessage };
