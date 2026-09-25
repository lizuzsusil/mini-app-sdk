export const NAMESPACES = {
  AUTH: "auth",
  PERMISSIONS: "permissions",
  FLAGS: "flags",
  CONFIG: "config",
  NAVIGATION: "navigation",
  PLATFORM: "platform",
  DEVICE: "device",
  API: "api",
  STORAGE: "storage",
  APPEARANCE: "appearance",
  NOTIFICATIONS: "notifications",
  LINKS: "links",
  EVENT: "event",
  HANDSHAKE: "handshake",
  HEARTBEAT: "heartbeat",
} as const;

export type Namespace = (typeof NAMESPACES)[keyof typeof NAMESPACES];

export const SDK_CAPABILITIES: string[] = [
  NAMESPACES.AUTH,
  NAMESPACES.PERMISSIONS,
  NAMESPACES.FLAGS,
  NAMESPACES.CONFIG,
  NAMESPACES.NAVIGATION,
  NAMESPACES.PLATFORM,
  NAMESPACES.DEVICE,
  NAMESPACES.STORAGE,
  NAMESPACES.API,
  NAMESPACES.APPEARANCE,
  NAMESPACES.NOTIFICATIONS,
  NAMESPACES.LINKS,
];

export const ACTIONS = {
  AUTH: {
    GET_USER: "getUser",
    IS_AUTHENTICATED: "isAuthenticated",
    LOGOUT: "logout",
  },
  PERMISSIONS: {
    HAS: "has",
    LIST: "list",
  },
  FLAGS: {
    IS_ENABLED: "isEnabled",
    GET_ALL: "getAll",
  },
  CONFIG: {
    GET: "get",
    GET_ALL: "getAll",
  },
  NAVIGATION: {
    NAVIGATE: "navigate",
    GET_CURRENT: "getCurrent",
    ROUTER: "router",
  },
  PLATFORM: {
    GET_TYPE: "getType",
  },
  DEVICE: {
    LOCATION: "location",
    CAMERA: "camera",
    GALLERY: "gallery",
    FILES: "files",
    DOWNLOAD: "download",
    CONTACT: "contact",
    BIOMETRIC: "biometric",
    NOTIFICATIONS: "notifications",
    NETWORK: "network",
    INFO: "info",
    SHARE: "share",
    CLIPBOARD_WRITE: "clipboardWrite",
    CLIPBOARD_READ: "clipboardRead",
    HAPTICS: "haptics",
    REVIEW: "review",
  },
  STORAGE: {
    GET: "get",
    SET: "set",
    REMOVE: "remove",
  },
  API: {
    REQUEST: "request",
    CANCEL: "cancel",
  },
  APPEARANCE: {
    GET_LOCALE: "getLocale",
    GET_THEME: "getTheme",
  },
  NOTIFICATIONS: {
    REGISTER: "register",
  },
  LINKS: {
    OPEN: "open",
  },
  EVENT: {
    SUBSCRIBE: "subscribe",
    UNSUBSCRIBE: "unsubscribe",
    EMIT: "emit",
  },
  HANDSHAKE: {
    CONNECT: "connect",
  },
  HEARTBEAT: {
    PING: "ping",
  },
} as const;

export const NAVIGATION_EVENTS = {
  BACK_REQUESTED: "navigation.back.requested",
  ROUTE_CHANGED: "navigation.route.changed",
} as const;

export const CONNECTION_EVENTS = {
  LOST: "connection.lost",
  ESTABLISHED: "connection.established",
} as const;

export const HTTP_EVENTS = {
  UPLOAD_PROGRESS: "api.uploadProgress",
} as const;

export const NOTIFICATIONS_EVENTS = {
  TOKEN: "notifications.token",
  OPENED: "notifications.opened",
} as const;

export const LINKS_EVENTS = {
  OPENED: "links.opened",
} as const;
