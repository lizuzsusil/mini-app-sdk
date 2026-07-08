# mini-app-sdk — Future Roadmap

This document outlines modules and capabilities that can be added to the SDK beyond the current feature set. Each entry includes the interface definition, a description, and the future benefit.

---

## Priority Legend

| Icon | Meaning |
|------|---------|
| 🔴 P0 | Critical — needed for most apps |
| 🟠 P1 | High — common production requirement |
| 🟡 P2 | Medium — valuable for specific use cases |
| 🟢 P3 | Nice to have — edge cases / polish |

---

## 1. Clipboard Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `clipboard` |

```typescript
interface ClipboardSdkModule {
  read(): Promise<string>;
  write(text: string): Promise<void>;
  hasText(): Promise<boolean>;
}
```

**Why:** Mini apps often need to copy codes, tokens, or share links. Without this, the mini app has no way to access the system clipboard. The host can integrate with Android `ClipboardManager` and iOS `UIPasteboard`.

---

## 2. Haptics Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `haptics` |

```typescript
type HapticFeedbackType = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

interface HapticsSdkModule {
  impact(style: HapticFeedbackType): Promise<void>;
  notification(type: 'success' | 'warning' | 'error'): Promise<void>;
  selection(): Promise<void>;
  vibrate(durationMs?: number): Promise<void>;
}
```

**Why:** Provides tactile feedback for UI interactions. Essential for native-feeling mobile experiences.

---

## 3. Secure Storage Module

| | |
|---|---|
| Priority | 🔴 P0 |
| Namespace | `secureStorage` |

```typescript
interface SecureStorageSdkModule {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

**Why:** The current `device.storage` uses the host's regular storage. A secure storage module uses platform keystores (Keychain on iOS, EncryptedSharedPreferences on Android) for tokens, secrets, and sensitive data. This is a hard requirement for any app handling auth tokens or PII.

---

## 4. Biometric Auth Module (Enhanced)

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `biometricAuth` |

```typescript
type BiometricType = 'fingerprint' | 'face' | 'iris' | 'multi';

interface BiometricAuthSdkModule {
  isAvailable(): Promise<{ available: boolean; biometryType?: BiometricType }>;
  authenticate(reason?: string): Promise<{ success: boolean; error?: string }>;
  isEnrolled(): Promise<boolean>;
}
```

**Why:** The current SDK only has `device.biometric()` in the Device module which returns a simple `{ success, error }`. A dedicated module with availability checks, reasoning prompts (iOS), and biometry type detection enables proper auth flows like "Login with Face ID".

---

## 5. Deep Linking Module

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `deepLink` |

```typescript
interface DeepLinkSdkModule {
  getInitialLink(): Promise<string | null>;
  onLink(handler: (link: string) => void): () => void;
  canOpenLink(url: string): Promise<boolean>;
}
```

**Why:** Allows the mini app to receive and respond to deep links received by the host app. Without this, mini apps cannot handle password-reset links, referral codes, or push notification navigation targets.

---

## 6. File System Module

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `fileSystem` |

```typescript
interface FileSystemEntry {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  isDirectory: boolean;
  modifiedAt: number;
}

interface FileReadResult {
  data: string;       // base64-encoded
  mimeType: string;
  size: number;
}

interface FileSystemSdkModule {
  readFile(path: string, encoding?: 'utf8' | 'base64'): Promise<FileReadResult>;
  writeFile(path: string, data: string, encoding?: 'utf8' | 'base64'): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listDirectory(path: string): Promise<FileSystemEntry[]>;
  stat(path: string): Promise<FileSystemEntry>;
  exists(path: string): Promise<boolean>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  getTemporaryDirectory(): Promise<string>;
  getDocumentsDirectory(): Promise<string>;
  readFileChunk(path: string, offset: number, length: number): Promise<FileReadResult>;
}
```

**Why:** The current `device.files()` only lets the user pick files. A full file system module enables reading/writing application files, caching assets, exporting data, and working with large files in chunks. Required for apps that handle documents, media, or offline data.

---

## 7. File Upload / Download Module

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `transfer` |

```typescript
type TransferState = 'pending' | 'uploading' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';

interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  speedBps: number;
  estimatedTimeRemainingMs: number;
}

interface TransferTask {
  id: string;
  state: TransferState;
  progress: TransferProgress;
  pause(): Promise<void>;
  resume(): Promise<void>;
  cancel(): Promise<void>;
}

interface UploadParams {
  filePath: string;
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  fieldName?: string;
  mimeType?: string;
}

interface DownloadParams {
  url: string;
  destinationPath: string;
  headers?: Record<string, string>;
  resume?: boolean;
}

interface TransferSdkModule {
  upload(params: UploadParams, onProgress?: (progress: TransferProgress) => void): Promise<TransferTask>;
  download(params: DownloadParams, onProgress?: (progress: TransferProgress) => void): Promise<TransferTask>;
  listActive(): Promise<TransferTask[]>;
  getTask(id: string): Promise<TransferTask | null>;
}
```

**Why:** The current `http` module only supports request/response — no progress, no pause/resume, no background transfer. Apps handling large files (images, videos, documents) need proper upload/download management, background execution, and cancellation.

---

## 8. WebSocket / Real-Time Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `realtime` |

```typescript
type SocketState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

interface SocketConnection {
  id: string;
  state: SocketState;
  close(): Promise<void>;
  send(data: string | ArrayBuffer): Promise<void>;
  onMessage(handler: (data: string | ArrayBuffer) => void): () => void;
  onStateChange(handler: (state: SocketState) => void): () => void;
  onError(handler: (error: string) => void): () => void;
}

interface SocketOptions {
  url: string;
  protocols?: string[];
  headers?: Record<string, string>;
  reconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
}

interface RealtimeSdkModule {
  connect(options: SocketOptions): Promise<SocketConnection>;
  disconnectAll(): Promise<void>;
  getActiveConnections(): Promise<SocketConnection[]>;
}
```

**Why:** WebSocket connections proxied through the host allow real-time features (chat, live updates, notifications) without the mini app needing direct network access. The host can also manage reconnection, certificate validation, and lifecycle.

---

## 9. Push Notification Module

| | |
|---|---|
| Priority | 🔴 P0 |
| Namespace | `push` |

```typescript
interface PushNotification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  badge?: number;
  sound?: string;
  category?: string;
  action?: string;
  imageUrl?: string;
  clicked: boolean;
  receivedAt: number;
}

interface PushAction {
  identifier: string;
  title: string;
  destructive?: boolean;
  foreground?: boolean;
}

interface PushCategory {
  identifier: string;
  actions: PushAction[];
}

interface PushSdkModule {
  register(): Promise<string>;  // returns device token
  unregister(): Promise<void>;
  getToken(): Promise<string | null>;
  getInitialNotification(): Promise<PushNotification | null>;
  onNotification(handler: (notification: PushNotification) => void): () => void;
  onTokenRefresh(handler: (token: string) => void): () => void;
  setBadgeCount(count: number): Promise<void>;
  getBadgeCount(): Promise<number>;
  requestPermission(): Promise<{ granted: boolean }>;
  getPermissionStatus(): Promise<'granted' | 'denied' | 'notDetermined'>;
  subscribeToTopic(topic: string): Promise<void>;
  unsubscribeFromTopic(topic: string): Promise<void>;
  // Notification categories for actionable notifications
  setCategories(categories: PushCategory[]): Promise<void>;
}
```

**Why:** Push notifications are a baseline requirement for any mobile app. The host manages FCM/APNs registration and the token lifecycle. The mini app needs to register, receive notifications, handle taps (deep linking), manage badges, and support actionable notifications.

---

## 10. Network Status Module (Enhanced)

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `network` |

```typescript
type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'vpn' | 'none' | 'unknown';

type CellularGeneration = '2g' | '3g' | '4g' | '5g';

interface CellularInfo {
  generation: CellularGeneration;
  carrier?: string;
  countryCode?: string;
  networkCode?: string;
  isRoaming: boolean;
}

interface NetworkStatus {
  connected: boolean;
  connectionType: ConnectionType;
  cellular?: CellularInfo;
  isMetered: boolean;
  isExpensive: boolean;
  downlinkMbps?: number;
  rttMs?: number;
}

interface NetworkSdkModule {
  getStatus(): Promise<NetworkStatus>;
  onStatusChange(handler: (status: NetworkStatus) => void): () => void;
  getCellularInfo(): Promise<CellularInfo | null>;
  isConnectedFast(): Promise<boolean>;
}
```

**Why:** The current `device.network()` returns a basic `{ online, type, effectiveType }`. A robust network module enables adaptive loading (download high-res only on WiFi), metered connection detection, and real-time status monitoring.

---

## 11. Offline Queue Module

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `offline` |

```typescript
type QueueEntryState = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface QueueEntry<T = unknown> {
  id: string;
  namespace: string;
  action: string;
  payload?: unknown;
  state: QueueEntryState;
  createdAt: number;
  lastAttemptAt?: number;
  attemptCount: number;
  maxAttempts: number;
  result?: T;
  error?: string;
}

interface QueueOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  backoffMultiplier?: number;
  maxRetryDelayMs?: number;
}

interface OfflineSdkModule {
  enqueue(namespace: string, action: string, payload?: unknown, options?: QueueOptions): Promise<string>;
  dequeue(id: string): Promise<void>;
  getQueue(): Promise<QueueEntry[]>;
  getPending(): Promise<QueueEntry[]>;
  getFailed(): Promise<QueueEntry[]>;
  retryFailed(): Promise<void>;
  cancelAll(): Promise<void>;
  onProcessed(handler: (entry: QueueEntry) => void): () => void;
  onFailed(handler: (entry: QueueEntry) => void): () => void;
  flush(): Promise<void>;  // process all pending immediately
  // Queue persistence
  isPersisted(): Promise<boolean>;
  clear(): Promise<void>;
}
```

**Why:** Mini apps must work offline or with spotty connectivity. The offline queue stores request payloads locally and replays them when connectivity resumes. Critical for forms, data entry, and IoT scenarios.

---

## 12. Payment / In-App Purchase Module

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `payment` |

```typescript
type PaymentProvider = 'apple_pay' | 'google_pay' | 'stripe' | 'custom';

type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';

interface PaymentProduct {
  id: string;
  title: string;
  description: string;
  price: string;           // localized price string
  priceMicros: number;     // price in micro-units
  currency: string;
  type: 'consumable' | 'non_consumable' | 'subscription';
  subscriptionPeriod?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  trialPeriodDays?: number;
  iconUrl?: string;
}

interface PaymentReceipt {
  transactionId: string;
  productId: string;
  status: PaymentStatus;
  purchaseDate: number;
  receiptData: string;     // base64 receipt
  originalTransactionId?: string;
  environment?: 'sandbox' | 'production';
}

interface PaymentSdkModule {
  getProducts(productIds: string[]): Promise<PaymentProduct[]>;
  purchase(productId: string, options?: { quantity?: number; accountId?: string }): Promise<PaymentReceipt>;
  restorePurchases(): Promise<PaymentReceipt[]>;
  getPurchaseHistory(productIds?: string[]): Promise<PaymentReceipt[]>;
  getAvailablePurchases(): Promise<PaymentReceipt[]>;
  // Subscriptions
  getSubscriptionStatus(productId: string): Promise<{
    active: boolean;
    expiryDate?: number;
    autoRenew: boolean;
    cancellationDate?: number;
  }>;
  // Receipt validation
  validateReceipt(transactionId: string): Promise<{ valid: boolean; message?: string }>;
  // Events
  onPurchaseUpdated(handler: (receipt: PaymentReceipt) => void): () => void;
}
```

**Why:** If the mini app platform ever hosts paid mini apps or offers in-app purchases (premium features, subscriptions, virtual goods), a payment module lets the host handle the complex platform-specific payment processing while the mini app gets a clean API.

---

## 13. Share Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `share` |

```typescript
interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
  filePaths?: string[];
}

interface ShareSdkModule {
  share(content: ShareContent): Promise<{ success: boolean; activityType?: string }>;
  shareToSocial(platform: 'twitter' | 'facebook' | 'whatsapp' | 'telegram', content: ShareContent): Promise<{ success: boolean }>;
  canShare(content: ShareContent): Promise<boolean>;
  getClipboardImage(): Promise<string | null>;  // base64
}
```

**Why:** Native share sheets (iOS UIActivityViewController, Android Intent.ACTION_SEND) are expected by users. The host presents the share UI while the mini app simply provides the content.

---

## 14. Contacts Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `contacts` |

```typescript
interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phoneNumbers: Array<{ label: string; number: string }>;
  emails: Array<{ label: string; email: string }>;
  photoThumbnail?: string;  // base64
  organization?: string;
  birthday?: string;        // ISO date
  note?: string;
}

interface ContactPickerOptions {
  multiple?: boolean;
  fields?: string[];
  title?: string;
}

interface ContactsSdkModule {
  getAll(): Promise<Contact[]>;
  pick(options?: ContactPickerOptions): Promise<Contact | Contact[] | null>;
  create(contact: Omit<Contact, 'id'>): Promise<string>;
  update(contact: Contact): Promise<void>;
  delete(id: string): Promise<void>;
  search(query: string): Promise<Contact[]>;
  getCount(): Promise<number>;
  onChanged(handler: () => void): () => void;
}
```

**Why:** Useful for social mini apps, referral features, and invite flows. The host handles permission prompts and platform-specific contacts APIs.

---

## 15. Calendar Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `calendar` |

```typescript
interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  startDate: number;       // epoch ms
  endDate: number;
  allDay?: boolean;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceEndDate?: number;
  alarmMinutesBefore?: number[];
  url?: string;
  calendarId?: string;
}

interface Calendar {
  id: string;
  title: string;
  color: string;
  isPrimary: boolean;
}

interface CalendarSdkModule {
  getCalendars(): Promise<Calendar[]>;
  createEvent(event: CalendarEvent): Promise<string>;   // returns event ID
  updateEvent(event: CalendarEvent): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  queryEvents(startDate: number, endDate: number, calendarId?: string): Promise<CalendarEvent[]>;
  openCalendar(date?: number): Promise<void>;
}

```

**Why:** Enables mini apps to add events to the user's calendar, useful for booking, scheduling, and appointment-based apps.

---

## 16. Media Module (Audio / Video / Camera Enhancement)

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `media` |

```typescript
type MediaSource = 'camera' | 'gallery' | 'microphone';

interface MediaPlayer {
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setRate(rate: number): Promise<void>;  // playback speed
  getPosition(): Promise<number>;
  getDuration(): Promise<number>;
  onStateChange(handler: (state: 'playing' | 'paused' | 'stopped' | 'ended' | 'loading' | 'error') => void): () => void;
}

interface MediaRecorder {
  start(): Promise<void>;
  stop(): Promise<string>;  // returns file path
  pause(): Promise<void>;
  resume(): Promise<void>;
  onData(handler: (chunk: string) => void): () => void;  // base64 chunks
}

interface MediaSdkModule {
  // Audio
  playAudio(url: string): Promise<MediaPlayer>;
  recordAudio(options?: { durationMs?: number; quality?: 'low' | 'medium' | 'high' }): Promise<MediaRecorder>;
  // Video
  playVideo(url: string, options?: { fullscreen?: boolean; controls?: boolean }): Promise<MediaPlayer>;
  // Image
  compressImage(filePath: string, options: { maxWidth?: number; maxHeight?: number; quality?: number }): Promise<string>;
  getMetadata(filePath: string): Promise<{
    width: number;
    height: number;
    durationMs?: number;
    mimeType: string;
    size: number;
    creationDate?: number;
    location?: { latitude: number; longitude: number };
  }>;
  // Thumbnail
  generateThumbnail(videoPath: string, atMs?: number): Promise<string>;  // base64
}
```

**Why:** The current `device.camera()` and `device.gallery()` only capture/pick media. A full media module adds playback control, recording, compression, metadata extraction, and thumbnail generation.

---

## 17. QR / Barcode Scanner Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `scan` |

```typescript
type BarcodeFormat =
  | 'qr'
  | 'aztec'
  | 'code_128'
  | 'code_39'
  | 'code_93'
  | 'data_matrix'
  | 'ean_8'
  | 'ean_13'
  | 'itf'
  | 'pdf_417'
  | 'upc_a'
  | 'upc_e';

interface ScanResult {
  value: string;
  format: BarcodeFormat;
  rawBytes?: string;       // base64
  cornerPoints?: Array<{ x: number; y: number }>;
}

interface ScanOptions {
  formats?: BarcodeFormat[];
  flash?: 'auto' | 'on' | 'off';
  showViewfinder?: boolean;
  instructionText?: string;
}

interface ScanSdkModule {
  scan(options?: ScanOptions): Promise<ScanResult | null>;
  scanFromImage(filePath: string, options?: { formats?: BarcodeFormat[] }): Promise<ScanResult[]>;
  generateCode(value: string, format: BarcodeFormat, options?: { width?: number; height?: number; color?: string }): Promise<string>;  // base64 image
}
```

**Why:** QR scanning is a common requirement (login, payments, tickets). The host uses platform-native scanner libraries (ML Kit, AVFoundation) for better performance.

---

## 18. Social Auth Module (Enhanced)

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `socialAuth` |

```typescript
type SocialProvider = 'google' | 'apple' | 'facebook' | 'twitter' | 'github' | 'microsoft' | 'line' | 'kakao';

interface SocialAuthResult {
  provider: SocialProvider;
  token: string;
  idToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
    photoUrl?: string;
  };
  expiresIn?: number;
}

interface SocialAuthSdkModule {
  login(provider: SocialProvider, options?: { scopes?: string[] }): Promise<SocialAuthResult>;
  logout(provider: SocialProvider): Promise<void>;
  getToken(provider: SocialProvider): Promise<string | null>;
  refreshToken(provider: SocialProvider): Promise<string>;
  isLoggedIn(provider: SocialProvider): Promise<boolean>;
  getUser(provider: SocialProvider): Promise<SocialAuthResult['user'] | null>;
  // Multi-provider linking
  linkAccount(provider: SocialProvider, options?: { scopes?: string[] }): Promise<SocialAuthResult>;
  unlinkAccount(provider: SocialProvider): Promise<void>;
  getLinkedProviders(): Promise<SocialProvider[]>;
}
```

**Why:** The current `auth` module uses the host's own auth system. A social auth module lets mini apps offer "Sign in with Google/Apple/Facebook" through the host's platform-native auth flows (Google Sign-In, Sign in with Apple, Facebook Login).

---

## 19. Theme Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `theme` |

```typescript
interface ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer?: string;
  secondary: string;
  onSecondary: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  error: string;
  onError: string;
  outline?: string;
  surfaceVariant?: string;
}

interface ThemeTypography {
  fontFamily?: string;
  headlineLarge?: { fontSize: number; fontWeight: number; lineHeight: number };
  headlineMedium?: { fontSize: number; fontWeight: number; lineHeight: number };
  bodyLarge?: { fontSize: number; fontWeight: number; lineHeight: number };
  bodyMedium?: { fontSize: number; fontWeight: number; lineHeight: number };
  labelLarge?: { fontSize: number; fontWeight: number; lineHeight: number };
}

interface Theme {
  colors: ThemeColors;
  typography?: ThemeTypography;
  borderRadius?: number;
  dark: boolean;
  highContrast?: boolean;
  reducedMotion?: boolean;
  fontScale?: number;
}

interface ThemeSdkModule {
  getTheme(): Promise<Theme>;
  onThemeChanged(handler: (theme: Theme) => void): () => void;
  setMode(mode: 'light' | 'dark' | 'system'): Promise<void>;
  getMode(): Promise<'light' | 'dark' | 'system'>;
  // Shorthand helpers
  isDark(): Promise<boolean>;
  isHighContrast(): Promise<boolean>;
  prefersReducedMotion(): Promise<boolean>;
}
```

**Why:** Mini apps should match the host platform's theme for a cohesive user experience. Reacts to system dark mode, high contrast, and accessibility settings.

---

## 20. Locale / i18n Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `locale` |

```typescript
interface LocaleInfo {
  locale: string;                // e.g. 'en-US', 'zh-CN'
  language: string;              // e.g. 'en', 'zh'
  region?: string;               // e.g. 'US', 'CN'
  textDirection: 'ltr' | 'rtl';
  timezone: string;
  currency: string;
  decimalSeparator: string;
  thousandsSeparator: string;
  measurementSystem: 'metric' | 'imperial' | 'us';
  firstDayOfWeek: number;        // 0=Sun, 1=Mon
}

interface LocaleSdkModule {
  getLocale(): Promise<LocaleInfo>;
  onLocaleChanged(handler: (locale: LocaleInfo) => void): () => void;
  getTranslation(key: string, params?: Record<string, string>): Promise<string>;
  getTranslations(keys: string[], params?: Record<string, string>): Promise<Record<string, string>>;
  getAvailableLocales(): Promise<string[]>;
  setLocale(locale: string): Promise<void>;  // if mini app can override
  formatDate(date: number, options?: { dateStyle?: string; timeStyle?: string }): Promise<string>;
  formatNumber(value: number, options?: { style?: 'decimal' | 'currency' | 'percent'; currency?: string }): Promise<string>;
  formatRelativeTime(value: number, unit: 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year'): Promise<string>;
  getTranslatedMessages(namespace: string): Promise<Record<string, string>>;
}
```

**Why:** The host platform knows the user's locale. Centralizing i18n in the host means mini apps don't need to bundle translation files. The host can also provide server-driven translations that update without a mini app redeployment.

---

## 21. App Lifecycle Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `lifecycle` |

```typescript
type AppState = 'foreground' | 'background' | 'inactive' | 'terminated';

interface LifecycleSdkModule {
  getState(): Promise<AppState>;
  onStateChange(handler: (state: AppState) => void): () => void;
  onMemoryWarning(handler: () => void): () => void;
  onUserInteraction(handler: () => void): () => void;
  // Splash screen
  hideSplashScreen(): Promise<void>;
  // Keep awake
  keepAwake(enable: boolean): Promise<void>;
  // Screen orientation
  lockOrientation(orientation: 'portrait' | 'landscape' | 'auto'): Promise<void>;
  unlockOrientation(): Promise<void>;
}
```

**Why:** Mini apps need to know when they go to the background (to pause timers, save state) and handle memory pressure. Also useful for splash screen control and orientation locking.

---

## 22. App Update Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `appUpdate` |

```typescript
type UpdateAvailability = 'available' | 'required' | 'current' | 'unknown';
type UpdateInstallSource = 'play_store' | 'app_store' | 'in_app' | 'side_load';

interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: UpdateAvailability;
  releaseNotes?: string;
  downloadSize?: number;           // bytes
  installSource: UpdateInstallSource;
  lastChecked?: number;            // epoch ms
}

interface AppUpdateSdkModule {
  checkForUpdate(): Promise<AppUpdateInfo>;
  startUpdate(options?: { force?: boolean; showProgress?: boolean }): Promise<void>;
  onUpdateProgress(handler: (progress: number) => void): () => void;
  onUpdateStatus(handler: (status: 'downloading' | 'installing' | 'completed' | 'failed') => void): () => void;
  getUpdateInfo(): Promise<AppUpdateInfo | null>;
}
```

**Why:** The mini app can query the host for available updates and trigger an in-app update flow. Useful for critical security patches or feature updates.

---

## 23. Performance Monitoring Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `performance` |

```typescript
interface PerformanceMetrics {
  fps: number;
  droppedFrames: number;
  memoryUsage: {
    used: number;
    total: number;
    peak?: number;
    warning: boolean;
  };
  cpuUsage?: number;           // percentage
  networkLatency?: number;     // ms
  diskUsage?: {
    appSize: number;
    cacheSize: number;
    dataSize: number;
  };
  batteryLevel?: number;       // 0–1
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical';
}

interface PerformanceSdkModule {
  getMetrics(): Promise<PerformanceMetrics>;
  onMetrics(handler: (metrics: PerformanceMetrics) => void): () => void;  // periodic
  startTrace(name: string): Promise<string>;  // returns trace ID
  stopTrace(traceId: string): Promise<void>;
  recordMetric(name: string, value: number, tags?: Record<string, string>): Promise<void>;
  mark(name: string): Promise<void>;  // custom timestamp
  measure(fromMark: string, toMark: string, label?: string): Promise<number>;  // duration
  setEnabled(enabled: boolean): Promise<void>;
}
```

**Why:** Enables proactive detection of performance issues (frame drops, memory leaks, overheating) before users report them.

---

## 24. Crash & Error Reporting Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `crash` |

```typescript
type BreadcrumbType = 'navigation' | 'http' | 'user' | 'state' | 'error' | 'debug';

interface Breadcrumb {
  type: BreadcrumbType;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface CrashReport {
  error: string;
  stackTrace: string;
  breadcrumbs: Breadcrumb[];
  appState: string;
  deviceInfo: {
    platform: string;
    osVersion: string;
    appVersion: string;
    deviceModel: string;
    freeMemory?: number;
    lowMemory?: boolean;
  };
  sdkVersion: string;
  moduleId: string;
}

interface CrashSdkModule {
  setUser(id: string, email?: string, name?: string): Promise<void>;
  addBreadcrumb(type: BreadcrumbType, message: string, data?: Record<string, unknown>): Promise<void>;
  setContext(key: string, value: unknown): Promise<void>;
  removeContext(key: string): Promise<void>;
  recordError(error: string | Error, context?: Record<string, unknown>): Promise<string>;  // returns report ID
  crash(): void;  // intentionally crash (for testing)
  getLastReport(): Promise<CrashReport | null>;
  onNewReport(handler: (report: CrashReport) => void): () => void;
}
```

**Why:** The current `telemetry.error()` is fire-and-forget. A dedicated crash module adds breadcrumb trails, context, and full crash reports for debugging issues in production.

---

## 25. Inter-MiniApp Communication Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `interApp` |

```typescript
interface InterAppMessage {
  from: string;
  to: string;           // target moduleId, or '*' for broadcast
  type: string;         // application-defined message type
  payload?: unknown;
  id: string;
  replyTo?: string;     // for request/response between mini apps
}

type SubscriptionFilter = {
  types?: string[];
  from?: string;
};

interface InterAppSdkModule {
  send(targetModuleId: string, type: string, payload?: unknown): Promise<string>;  // returns message ID
  broadcast(type: string, payload?: unknown): Promise<void>;
  request<T = unknown>(targetModuleId: string, type: string, payload?: unknown): Promise<T>;
  onMessage(filter: SubscriptionFilter, handler: (msg: InterAppMessage) => void): () => void;
  replyTo(originalMsg: InterAppMessage, type: string, payload?: unknown): Promise<void>;
  getPeers(): Promise<string[]>;  // list of connected mini apps
  onPeerConnected(handler: (moduleId: string) => void): () => void;
  onPeerDisconnected(handler: (moduleId: string) => void): () => void;
}
```

**Why:** If the host supports running multiple mini apps simultaneously (e.g. dashboard + widget), they need a way to communicate. This enables cross-mini-app workflows like "select an item in App A and share it to App B".

---

## 26. Plugin / Extension Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `plugins` |

```typescript
interface PluginCapability {
  name: string;
  version: string;
  methods: string[];
  events: string[];
  description?: string;
  permissions?: string[];
}

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  capabilities: PluginCapability[];
  vendor?: string;
  icon?: string;
  homepage?: string;
}

interface PluginSdkModule {
  register(manifest: PluginManifest, implementation: {
    call(method: string, args?: unknown[]): Promise<unknown>;
  }): Promise<void>;
  unregister(pluginId: string): Promise<void>;
  getInstalled(): Promise<PluginManifest[]>;
  getCapability(pluginId: string, capabilityName: string): Promise<PluginCapability | null>;
  call<T = unknown>(pluginId: string, method: string, ...args: unknown[]): Promise<T>;
  onPluginEvent(pluginId: string, event: string, handler: (data: unknown) => void): () => void;
}
```

**Why:** A plugin system allows third-party developers to extend mini app capabilities without modifying the SDK. The host can load native plugins and expose them to mini apps through this module.

---

## 27. Geofencing Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `geofencing` |

```typescript
interface GeofenceRegion {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  notifyOnDwell: boolean;
  dwellDurationMs?: number;
  loiteringDelayMs?: number;
}

type GeofenceTransition = 'enter' | 'exit' | 'dwell';

interface GeofenceEvent {
  region: GeofenceRegion;
  transition: GeofenceTransition;
  timestamp: number;
}

interface GeofencingSdkModule {
  addRegion(region: GeofenceRegion): Promise<void>;
  removeRegion(id: string): Promise<void>;
  removeAll(): Promise<void>;
  getRegions(): Promise<GeofenceRegion[]>;
  getCurrentRegions(): Promise<GeofenceRegion[]>;  // regions the user is currently inside
  onTransition(handler: (event: GeofenceEvent) => void): () => void;
  onError(handler: (error: { regionId?: string; message: string }) => void): () => void;
}
```

**Why:** Enables location-based features triggered by entering/exiting areas. Valuable for retail, logistics, and travel mini apps.

---

## 28. NFC Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `nfc` |

```typescript
type NfcTechType = 'ndef' | 'iso_dep' | 'mifare_classic' | 'mifare_ultralight' | 'nfc_a' | 'nfc_b' | 'nfc_f' | 'nfc_v';

interface NdefRecord {
  type: string;           // TNF + type
  payload: string;        // base64
  id?: string;
  language?: string;
  uri?: string;
  mimeType?: string;
}

interface NdefMessage {
  records: NdefRecord[];
}

interface NfcTag {
  id: string;             // hex-encoded UID
  techTypes: NfcTechType[];
  ndefMessage?: NdefMessage;
  maxSize?: number;
  canMakeReadOnly?: boolean;
  isWritable?: boolean;
}

interface NfcSdkModule {
  isAvailable(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  openSettings(): Promise<void>;
  // Reader mode
  startScanning(options?: { once?: boolean; techTypes?: NfcTechType[] }): Promise<void>;
  stopScanning(): Promise<void>;
  onTagDiscovered(handler: (tag: NfcTag) => void): () => void;
  // Writer mode
  writeNdef(tagId: string, message: NdefMessage): Promise<void>;
  formatNdef(tagId: string): Promise<void>;
  makeReadOnly(tagId: string): Promise<void>;
  // NDEF helpers
  createTextRecord(text: string, language?: string): NdefRecord;
  createUriRecord(uri: string): NdefRecord;
  createMimeRecord(mimeType: string, payload: string): NdefRecord;  // payload = base64
  transceive(tagId: string, data: string): Promise<string>;  // raw APDU, returns base64
}
```

**Why:** For mini apps in physical access, loyalty, or ticketing domains. The host manages the platform NFC stack.

---

## 29. Bluetooth / BLE Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `bluetooth` |

```typescript
type BluetoothState = 'poweredOn' | 'poweredOff' | 'unauthorized' | 'unsupported' | 'unknown' | 'resetting';

interface BluetoothDevice {
  id: string;
  name: string;
  rssi: number;
  advertisementData?: {
    localName?: string;
    manufacturerData?: Record<number, string>;  // companyId -> base64
    serviceUuids?: string[];
    txPowerLevel?: number;
    isConnectable?: boolean;
  };
  mtu?: number;
}

interface BleService {
  uuid: string;
  primary: boolean;
  characteristics: BleCharacteristic[];
}

interface BleCharacteristic {
  uuid: string;
  serviceUuid: string;
  properties: {
    read: boolean;
    write: boolean;
    writeWithoutResponse: boolean;
    notify: boolean;
    indicate: boolean;
  };
  value?: string;  // base64
}

interface BleDescriptor {
  uuid: string;
  characteristicUuid: string;
  value?: string;  // base64
}

interface BluetoothSdkModule {
  getState(): Promise<BluetoothState>;
  onStateChange(handler: (state: BluetoothState) => void): () => void;
  enable(): Promise<void>;
  // Scanning
  startScan(serviceUuids?: string[]): Promise<void>;
  stopScan(): Promise<void>;
  onDeviceDiscovered(handler: (device: BluetoothDevice) => void): () => void;
  // Connection
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  getConnectedDevices(): Promise<BluetoothDevice[]>;
  onDeviceConnected(handler: (device: BluetoothDevice) => void): () => void;
  onDeviceDisconnected(handler: (device: BluetoothDevice) => void): () => void;
  // Services
  discoverServices(deviceId: string): Promise<BleService[]>;
  getServices(deviceId: string): Promise<BleService[]>;
  // Read/Write
  readCharacteristic(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<string>;  // base64
  writeCharacteristic(deviceId: string, serviceUuid: string, characteristicUuid: string, value: string, withoutResponse?: boolean): Promise<void>;
  // Notifications
  startNotifications(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void>;
  stopNotifications(deviceId: string, serviceUuid: string, characteristicUuid: string): Promise<void>;
  onNotificationReceived(handler: (data: { deviceId: string; serviceUuid: string; characteristicUuid: string; value: string }) => void): () => void;
  // MTU
  requestMtu(deviceId: string, mtu: number): Promise<number>;
  // Descriptors
  readDescriptor(deviceId: string, serviceUuid: string, characteristicUuid: string, descriptorUuid: string): Promise<string>;
  writeDescriptor(deviceId: string, serviceUuid: string, characteristicUuid: string, descriptorUuid: string, value: string): Promise<void>;
}
```

**Why:** Essential for IoT mini apps — connecting to BLE devices for configuration, data collection, or control.

---

## 30. Multi-Window / Picture-in-Picture Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `multiWindow` |

```typescript
interface PipParams {
  width: number;
  height: number;
  aspectRatio?: number;
  autoEnter?: boolean;
}

interface WindowConfig {
  url?: string;              // different route in PiP
  width: number;
  height: number;
  x?: number;
  y?: number;
  resizable?: boolean;
  maximizable?: boolean;
  title?: string;
}

interface MultiWindowSdkModule {
  isPipAvailable(): Promise<boolean>;
  enterPip(params: PipParams): Promise<void>;
  exitPip(): Promise<void>;
  onPipStateChange(handler: (isInPip: boolean) => void): () => void;
  // Multi window
  openWindow(config: WindowConfig): Promise<string>;  // returns window ID
  closeWindow(windowId: string): Promise<void>;
  focusWindow(windowId: string): Promise<void>;
  getWindows(): Promise<Array<{ id: string; config: WindowConfig }>>;
  onWindowOpened(handler: (windowId: string) => void): () => void;
  onWindowClosed(handler: (windowId: string) => void): () => void;
}
```

**Why:** For video playback in PiP mode or multi-window dashboards on tablets/desktop.

---

## 31. Background Tasks Module

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `background` |

```typescript
type BackgroundTaskType = 'periodic' | 'oneShot' | 'deferred';

type TaskPriority = 'low' | 'default' | 'high';

interface BackgroundTaskConfig {
  type: BackgroundTaskType;
  name: string;
  intervalMs?: number;            // for periodic tasks
  delayMs?: number;               // for one-shot tasks
  priority?: TaskPriority;
  requiresNetwork?: boolean;
  requiresCharging?: boolean;
  requiresDeviceIdle?: boolean;
  minBatteryLevel?: number;       // 0–1
  constraints?: Array<{
    type: 'network' | 'battery' | 'charging' | 'idle' | 'storage';
    satisfied: boolean;
  }>;
}

interface BackgroundTaskResult {
  success: boolean;
  message?: string;
  data?: unknown;
  nextRun?: number;
}

interface BackgroundTask {
  id: string;
  config: BackgroundTaskConfig;
  lastRun?: number;
  nextRun?: number;
  totalRuns: number;
  isRegistered: boolean;
  cancel(): Promise<void>;
  updateConfig(config: Partial<BackgroundTaskConfig>): Promise<void>;
  runNow(): Promise<void>;
}

interface BackgroundSdkModule {
  registerTask(name: string, handler: () => Promise<BackgroundTaskResult>, config: BackgroundTaskConfig): Promise<string>;
  unregisterTask(taskId: string): Promise<void>;
  getTasks(): Promise<BackgroundTask[]>;
  runNow(taskId: string): Promise<void>;
  getRemainingCapacity(): Promise<{
    maxTasks: number;
    usedSlots: number;
    remainingSlots: number;
  }>;
  onTaskResult(handler: (result: { taskId: string; result: BackgroundTaskResult }) => void): () => void;
}
```

**Why:** Enables synchronization, data cleanup, and fetch operations when the mini app is not in the foreground. The host manages OS-level job scheduling (WorkManager on Android, BGTaskScheduler on iOS).

---

## 32. Face / Body Detection Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `vision` |

```typescript
interface FaceDetectionResult {
  faces: Array<{
    bounds: { left: number; top: number; width: number; height: number };
    landmarks?: {
      leftEye?: { x: number; y: number };
      rightEye?: { x: number; y: number };
      nose?: { x: number; y: number };
      mouth?: { x: number; y: number };
      leftEar?: { x: number; y: number };
      rightEar?: { x: number; y: number };
    };
    probabilities?: {
      smiling?: number;
      leftEyeOpen?: number;
      rightEyeOpen?: number;
    };
    rotation?: { yaw: number; roll: number };
  }>;
}

interface TextRecognitionResult {
  text: string;
  blocks: Array<{
    text: string;
    bounds: { left: number; top: number; width: number; height: number };
    lines: Array<{
      text: string;
      bounds: { left: number; top: number; width: number; height: number };
    }>;
  }>;
}

interface VisionSdkModule {
  detectFaces(imagePath: string): Promise<FaceDetectionResult>;
  recognizeText(imagePath: string): Promise<TextRecognitionResult>;
  detectBarcodes(imagePath: string): Promise<ScanResult[]>;  // reuses scan types
  isSupported(feature: 'face' | 'text' | 'barcode'): Promise<boolean>;
}
```

**Why:** Host-side ML Kit / Vision framework integration for face detection and OCR without bundling ML models in the mini app.

---

## 33. Speech Module

| | |
|---|---|
| Priority | 🟢 P3 |
| Namespace | `speech` |

```typescript
interface SpeechSynthesisVoice {
  name: string;
  language: string;
  quality: 'default' | 'enhanced' | 'premium';
  gender?: 'male' | 'female';
}

interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{ text: string; confidence: number }>;
}

interface SpeechSynthesisSdkModule {
  speak(text: string, options?: { voice?: string; rate?: number; pitch?: number; volume?: number }): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getVoices(language?: string): Promise<SpeechSynthesisVoice[]>;
  isSpeaking(): Promise<boolean>;
  onSpeakingState(handler: (state: 'started' | 'paused' | 'resumed' | 'finished' | 'cancelled') => void): () => void;
}

interface SpeechRecognitionSdkModule {
  start(options?: { language?: string; continuous?: boolean; interimResults?: boolean }): Promise<void>;
  stop(): Promise<void>;
  abort(): Promise<void>;
  isListening(): Promise<boolean>;
  onResult(handler: (result: SpeechRecognitionResult) => void): () => void;
  onError(handler: (error: string) => void): () => void;
  onEnd(handler: () => void): () => void;
}

interface SpeechSdkModule {
  synthesis: SpeechSynthesisSdkModule;
  recognition: SpeechRecognitionSdkModule;
  isSynthesisAvailable(): Promise<boolean>;
  isRecognitionAvailable(): Promise<boolean>;
  requestPermission(): Promise<{ granted: boolean }>;
}
```

**Why:** Text-to-speech and speech-to-text for accessibility, voice commands, and hands-free interaction.

---

## 34. Auth Module — MFA / OTP Enhancement

| | |
|---|---|
| Priority | 🟡 P2 |
| Namespace | `auth` (enhancement) |

```typescript
interface AuthSdkModule {  // Extended
  getUser(): Promise<PlatformUser | null>;
  isAuthenticated(): Promise<boolean>;
  logout(): Promise<void>;

  // New:
  getToken(): Promise<string | null>;
  refreshToken(): Promise<string>;
  onTokenExpired(handler: () => Promise<string>): () => void;  // silent refresh hook
  // Multi-factor
  requestMfa(method: 'sms' | 'email' | 'totp' | 'push'): Promise<{ sessionId: string }>;
  verifyMfa(sessionId: string, code: string, method: string): Promise<boolean>;
  // Session management
  getSessionInfo(): Promise<{
    createdAt: number;
    expiresAt: number;
    lastActivity: number;
    ipAddress?: string;
    deviceName?: string;
  }>;
  revokeOtherSessions(): Promise<void>;
  // Account switching
  getAvailableAccounts(): Promise<PlatformUser[]>;
  switchAccount(userId: string): Promise<void>;
}
```

**Why:** Adds token management with silent refresh, MFA flows for sensitive operations, and multi-account support.

---

## 35. HTTP Module Enhancement (Interceptors & Caching)

| | |
|---|---|
| Priority | 🟠 P1 |
| Namespace | `http` (enhancement) |

```typescript
type HttpInterceptor = (request: {
  method: string;
  endpoint: string;
  headers: Record<string, string>;
  body?: unknown;
}) => Promise<{
  endpoint?: string;
  headers?: Record<string, string>;
  body?: unknown;
  shouldRetry?: boolean;
}>;

type HttpCachePolicy = 'noCache' | 'forceCache' | 'networkFirst' | 'cacheFirst' | 'staleWhileRevalidate';

interface HttpCacheEntry<T> {
  data: T;
  headers: Record<string, string>;
  cachedAt: number;
  expiresAt: number;
  etag?: string;
}

interface HttpSdkModule {  // Extended
  get<T = unknown>(endpoint: string, query?: Record<string, string>, headers?: Record<string, string>): Promise<HttpResult<T>>;
  post<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  put<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  patch<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResult<T>>;
  delete<T = unknown>(endpoint: string, headers?: Record<string, string>): Promise<HttpResult<T>>;

  // New:
  get<T = unknown>(endpoint: string, query?: Record<string, string>, headers?: Record<string, string>,
    options?: { cachePolicy?: HttpCachePolicy; cacheTtlMs?: number; priority?: 'high' | 'low' }): Promise<HttpResult<T>>;
  // Interceptors
  addRequestInterceptor(interceptor: HttpInterceptor): () => void;  // returns remove fn
  addResponseInterceptor(interceptor: (response: HttpResult) => Promise<HttpResult>): () => void;
  // Cache management
  clearCache(): Promise<void>;
  getCacheSize(): Promise<number>;
  removeCacheEntry(endpoint: string): Promise<void>;
  // Request cancellation
  cancelRequest(endpoint: string, method?: string): Promise<void>;
  cancelAllRequests(): Promise<void>;
  // Batch requests
  batch<T = unknown>(requests: Array<{ method: string; endpoint: string; body?: unknown }>): Promise<T[]>;
  // Retry policies
  setRetryPolicy(policy: { maxAttempts: number; retryableStatuses: number[]; delayMs: number }): Promise<void>;
}
```

**Why:** Adds request/response interceptors for auth token injection, caching for offline support, request cancellation, and batch operations.

---

## Summary: Priority Matrix

| Priority | Modules |
|----------|---------|
| 🔴 P0 | Secure Storage, Push Notifications |
| 🟠 P1 | Biometric Auth (Enhanced), Deep Linking, File System, File Upload/Download, Offline Queue, Payment/IAP, HTTP Enhancement, MFA Auth |
| 🟡 P2 | Clipboard, WebSocket/Real-Time, Network Status (Enhanced), Share, Media, QR/Barcode Scanner, Social Auth, Theme, Locale/i18n, App Lifecycle, Crash Reporting, Plugins, Background Tasks |
| 🟢 P3 | Haptics, Contacts, Calendar, Geofencing, NFC, Bluetooth/BLE, Multi-Window/PiP, Inter-MiniApp Communication, Face/Vision, Speech, App Update, Performance Monitoring |

## Implementation Order Recommendation

```
Phase 1 (Core Reliability)
├── Secure Storage
├── Push Notifications
├── HTTP Enhancement (interceptors, caching, cancellation)
├── Offline Queue
└── File System

Phase 2 (Essential App Features)
├── Deep Linking
├── Biometric Auth (Enhanced)
├── File Upload/Download
├── Payment / IAP
├── MFA Auth Enhancement
└── Network Status (Enhanced)

Phase 3 (Rich UX)
├── Theme
├── Locale / i18n
├── Share
├── QR / Barcode Scanner
├── Media (playback + compression)
└── App Lifecycle

Phase 4 (Specialized)
├── WebSocket / Real-Time
├── Social Auth
├── Crash Reporting
├── Background Tasks
├── Plugins
├── Clipboard
└── Haptics

Phase 5 (Niche / Platform-specific)
├── Bluetooth / BLE
├── NFC
├── Geofencing
├── Speech
├── Vision / Face Detection
├── Contacts
├── Calendar
├── Inter-MiniApp Communication
├── Multi-Window / PiP
├── Performance Monitoring
├── App Update
└── Multi-Window / PiP
```
