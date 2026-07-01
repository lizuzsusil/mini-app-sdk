// src/errors.ts
var SdkError = class extends Error {
  constructor(error) {
    super(error.message);
    this.name = "SdkError";
    this.code = error.code;
    this.retryable = error.retryable ?? false;
    this.details = error.details;
  }
};

// src/constants.ts
var PROTOCOL_VERSION = "2.0.0";
var PLATFORM_EVENT_NAME = "gov-platform-event";
var MESSAGE_CHANNEL = "gov-platform-sdk";

// src/utils.ts
function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function createMessage(type, namespace, action, source, target, payload, extra) {
  return {
    channel: MESSAGE_CHANNEL,
    id: extra?.id ?? generateId(),
    type,
    namespace,
    action,
    source,
    target,
    version: extra?.version ?? PROTOCOL_VERSION,
    payload,
    error: extra?.error,
    traceId: extra?.traceId ?? generateId(),
    timestamp: Date.now()
  };
}
function isPlatformMessage(data) {
  if (!data || typeof data !== "object") return false;
  const msg = data;
  return typeof msg.id === "string" && typeof msg.type === "string" && typeof msg.namespace === "string" && typeof msg.action === "string";
}

// src/transport.ts
var SdkTransport = class {
  constructor(moduleId, options) {
    this.pending = /* @__PURE__ */ new Map();
    this.eventHandlers = /* @__PURE__ */ new Map();
    this.messageListener = null;
    this.customEventListener = null;
    this.moduleId = moduleId;
    this.timeout = options.timeout ?? 1e4;
    this.retryAttempts = options.retryAttempts ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.traceId = generateId();
  }
  start() {
    this.messageListener = (event) => {
      if (!isPlatformMessage(event.data)) return;
      this.handleIncomingMessage(event.data);
    };
    window.addEventListener("message", this.messageListener);
    this.customEventListener = (event) => {
      const msg = event.detail;
      if (!isPlatformMessage(msg)) return;
      this.handleIncomingMessage(msg);
    };
    window.addEventListener(PLATFORM_EVENT_NAME, this.customEventListener);
  }
  stop() {
    if (this.messageListener) window.removeEventListener("message", this.messageListener);
    if (this.customEventListener) window.removeEventListener(PLATFORM_EVENT_NAME, this.customEventListener);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Transport stopped"));
    }
    this.pending.clear();
    this.eventHandlers.clear();
  }
  handleIncomingMessage(msg) {
    if (msg.target !== this.moduleId && msg.target !== "*") return;
    if (msg.type === "response") {
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
    if (msg.type === "event") {
      const handlers = this.eventHandlers.get(`${msg.namespace}.${msg.action}`);
      handlers?.forEach((h) => h(msg.payload));
    }
  }
  async request(namespace, action, payload) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.sendRequest(namespace, action, payload);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof SdkError && !err.retryable) throw err;
        if (attempt < this.retryAttempts) {
          await delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }
    throw lastError ?? new Error("Request failed");
  }
  sendRequest(namespace, action, payload) {
    const msg = createMessage("request", namespace, action, this.moduleId, "shell", payload, {
      traceId: this.traceId
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new SdkError({ code: "TIMEOUT", message: `Request ${namespace}.${action} timed out`, retryable: true }));
      }, this.timeout);
      this.pending.set(msg.id, {
        resolve,
        reject,
        timer
      });
      this.sendMessage(msg);
    });
  }
  sendMessage(msg) {
    window.parent.postMessage(msg, "*");
  }
  async handshake() {
    const msg = createMessage("handshake", "handshake", "", this.moduleId, "shell", {
      moduleId: this.moduleId,
      sdkVersion: "2.0.0"
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error("Handshake timed out"));
      }, this.timeout);
      this.pending.set(msg.id, {
        resolve: () => resolve(),
        reject,
        timer
      });
      this.sendMessage(msg);
    });
  }
  onEvent(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, /* @__PURE__ */ new Set());
    }
    this.eventHandlers.get(event).add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }
  getTraceId() {
    return this.traceId;
  }
};

// src/sdk.ts
var MiniAppSdk = class {
  constructor(options) {
    this.version = PROTOCOL_VERSION;
    this.initialized = false;
    this.eventHandlers = /* @__PURE__ */ new Map();
    // platform module needs access to the mutable platformType
    this.platformType = "WEB";
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
  async initialize() {
    if (this.initialized) return;
    this.transport.start();
    await this.transport.handshake();
    this.platformType = await this.transport.request("platform", "getType");
    this.initialized = true;
  }
  destroy() {
    this.transport.stop();
    this.eventHandlers.clear();
    this.initialized = false;
  }
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, /* @__PURE__ */ new Set());
      this.transport.request("event", "subscribe", { eventType: event }).catch(() => {
      });
    }
    this.eventHandlers.get(event).add(handler);
    const transportUnsub = this.transport.onEvent(event, handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
      transportUnsub();
    };
  }
  createAuthModule() {
    return {
      getUser: () => this.transport.request("auth", "getUser"),
      isAuthenticated: () => this.transport.request("auth", "isAuthenticated"),
      logout: () => this.transport.request("auth", "logout")
    };
  }
  createPermissionsModule() {
    return {
      has: (permission) => this.transport.request("permissions", "has", { permission }),
      list: () => this.transport.request("permissions", "list")
    };
  }
  createFlagsModule() {
    return {
      isEnabled: (flag) => this.transport.request("flags", "isEnabled", { flag }),
      getAll: () => this.transport.request("flags", "getAll")
    };
  }
  createConfigModule() {
    return {
      get: (key) => this.transport.request("config", "get", { key }),
      getAll: () => this.transport.request("config", "getAll")
    };
  }
  createNavigationModule() {
    return {
      navigate: (target) => this.transport.request("navigation", "navigate", target),
      getCurrent: () => this.transport.request("navigation", "getCurrent")
    };
  }
  createTelemetryModule() {
    return {
      log: (level, message, context) => {
        this.transport.request("telemetry", "log", { level, message, context }).catch(() => {
        });
      },
      track: (event, properties) => {
        this.transport.request("telemetry", "track", { event, properties }).catch(() => {
        });
      },
      error: (error, context) => {
        const message = error instanceof Error ? error.message : error;
        this.transport.request("telemetry", "error", { message, context }).catch(() => {
        });
      }
    };
  }
  createPlatformModule() {
    const self = this;
    return {
      get type() {
        return self.platformType;
      },
      isWeb: () => self.platformType === "WEB",
      isAndroid: () => self.platformType === "ANDROID",
      isIOS: () => self.platformType === "IOS",
      isMobile: () => self.platformType !== "WEB"
    };
  }
  createDeviceModule() {
    return {
      location: (options) => this.transport.request("device", "location", options),
      camera: (options) => this.transport.request("device", "camera", options),
      gallery: (options) => this.transport.request("device", "gallery", options),
      files: (options) => this.transport.request("device", "files", options),
      biometric: (options) => this.transport.request("device", "biometric", options),
      notifications: (options) => this.transport.request("device", "notifications", options),
      network: () => this.transport.request("device", "network"),
      storage: {
        get: (key) => this.transport.request("device", "storage", { action: "get", key }).then((r) => r?.value ?? null),
        set: (key, value) => this.transport.request("device", "storage", { action: "set", key, value }),
        remove: (key) => this.transport.request("device", "storage", { action: "remove", key })
      },
      info: () => this.transport.request("device", "info")
    };
  }
  createHttpModule() {
    return {
      get: (endpoint, query, headers) => this.transport.request("http", "get", { endpoint, query, headers }),
      post: (endpoint, body, headers) => this.transport.request("http", "post", { endpoint, body, headers }),
      put: (endpoint, body, headers) => this.transport.request("http", "put", { endpoint, body, headers }),
      patch: (endpoint, body, headers) => this.transport.request("http", "patch", { endpoint, body, headers }),
      delete: (endpoint, headers) => this.transport.request("http", "delete", { endpoint, headers })
    };
  }
};
var globalSdk = null;
function createMiniAppSdk(options) {
  return new MiniAppSdk(options);
}
function getMiniAppSdk() {
  if (!globalSdk) {
    throw new Error("Mini App SDK not initialized. Call initMiniAppSdk() first.");
  }
  return globalSdk;
}
async function initMiniAppSdk(options) {
  globalSdk = new MiniAppSdk(options);
  await globalSdk.initialize();
  return globalSdk;
}
export {
  MESSAGE_CHANNEL,
  MiniAppSdk,
  PLATFORM_EVENT_NAME,
  PROTOCOL_VERSION,
  SdkError,
  SdkTransport,
  createMessage,
  createMiniAppSdk,
  delay,
  generateId,
  getMiniAppSdk,
  initMiniAppSdk,
  isPlatformMessage
};
