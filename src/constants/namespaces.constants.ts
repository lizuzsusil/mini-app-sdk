/**
 * Every RPC namespace the SDK talks to. Centralized so a typo in a module
 * implementation becomes a compile error (unknown property) instead of a
 * silently-broken runtime string.
 */
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
  HTTP: "http",
  APPEARANCE: "appearance",
  AI: "ai",
  EVENT: "event",
  HANDSHAKE: "handshake",
  HEARTBEAT: "heartbeat",
} as const;

export type Namespace = (typeof NAMESPACES)[keyof typeof NAMESPACES];

/**
 * The domain namespaces this SDK build can make requests against. Sent to
 * the host during the handshake so it can tell the mini app which of them,
 * if any, it doesn't actually implement — deliberately excludes `event` and
 * `handshake`, which are protocol-level concerns rather than domain
 * capabilities a host opts in or out of.
 */
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
  NAMESPACES.HTTP,
  NAMESPACES.APPEARANCE,
  NAMESPACES.AI,
];

/**
 * Actions, grouped by namespace. Every module implementation must use these
 * instead of inline string literals.
 */
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
    BACK: "back",
    PUSH: "push",
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
  },
  HTTP: {
    GET: "get",
    POST: "post",
    PUT: "put",
    PATCH: "patch",
    DELETE: "delete",
  },
  STORAGE: {
    GET: "get",
    SET: "set",
    REMOVE: "remove",
  },
  API: {
    REQUEST: "request",
  },
  APPEARANCE: {
    GET_LOCALE: "getLocale",
    GET_THEME: "getTheme",
  },
  AI: {
    CHAT: "chat",
    CANCEL: "cancel",
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

/**
 * Navigation events on the wire, in both directions:
 *
 *  - `BACK_REQUESTED` (host → mini app) is published when the user presses
 *    the native back button. The host holds the container open until the
 *    mini app answers with `navigation.router.back(consumed)`; `false`
 *    means "I'm at my root, you take over".
 *  - `ROUTE_CHANGED` (mini app → host) is what a mini app `emit()`s after
 *    its own router moved, so the host can keep its back-button policy in
 *    sync without polling `navigation.getCurrent()`.
 */
export const NAVIGATION_EVENTS = {
  BACK_REQUESTED: "navigation.back.requested",
  ROUTE_CHANGED: "navigation.route.changed",
} as const;

/**
 * Connection-state events the SDK itself emits (as opposed to host-published
 * events). Mini apps subscribe with `sdk.on("connection.lost", …)` /
 * `sdk.on("connection.established", …)` to reconcile state — re-fetch config
 * or flags, re-subscribe to events — after a host restart or transport drop.
 * Emitted only when the heartbeat/reconnect feature is enabled.
 */
export const CONNECTION_EVENTS = {
  LOST: "connection.lost",
  ESTABLISHED: "connection.established",
} as const;
