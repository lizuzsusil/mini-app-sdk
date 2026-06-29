import { FLUTTER_BRIDGE_KEY, PLATFORM_EVENT_NAME } from './constants';
import { SdkError } from './errors';
import type { EventHandler, FlutterBridge, PlatformMessage, TransportMode } from './types';
import { createMessage, delay, generateId, isPlatformMessage } from './utils';

export class SdkTransport {
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
      const handlers = this.eventHandlers.get(`${msg.namespace}.${msg.action}`);
      handlers?.forEach((h) => h(msg.payload));
    }
  }

  async request<T>(namespace: string, action: string, payload?: unknown): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.sendRequest<T>(namespace, action, payload);
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

  private sendRequest<T>(namespace: string, action: string, payload?: unknown): Promise<T> {
    const msg = createMessage('request', namespace, action, this.moduleId, 'shell', payload, {
      traceId: this.traceId,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new SdkError({ code: 'TIMEOUT', message: `Request ${namespace}.${action} timed out`, retryable: true }));
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
    const msg = createMessage('handshake', 'handshake', '', this.moduleId, 'shell', {
      moduleId: this.moduleId,
      sdkVersion: '1.0.0',
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
