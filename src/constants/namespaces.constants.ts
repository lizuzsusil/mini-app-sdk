/**
 * Every RPC namespace the SDK talks to. Centralized so a typo in a module
 * implementation becomes a compile error (unknown property) instead of a
 * silently-broken runtime string.
 */
export const NAMESPACES = {
  AUTH: 'auth',
  PERMISSIONS: 'permissions',
  FLAGS: 'flags',
  CONFIG: 'config',
  NAVIGATION: 'navigation',
  PLATFORM: 'platform',
  DEVICE: 'device',
  HTTP: 'http',
  EVENT: 'event',
  HANDSHAKE: 'handshake',
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
  NAMESPACES.HTTP,
];

/**
 * Actions, grouped by namespace. Every module implementation must use these
 * instead of inline string literals.
 */
export const ACTIONS = {
  AUTH: {
    GET_USER: 'getUser',
    IS_AUTHENTICATED: 'isAuthenticated',
    LOGOUT: 'logout',
  },
  PERMISSIONS: {
    HAS: 'has',
    LIST: 'list',
  },
  FLAGS: {
    IS_ENABLED: 'isEnabled',
    GET_ALL: 'getAll',
  },
  CONFIG: {
    GET: 'get',
    GET_ALL: 'getAll',
  },
  NAVIGATION: {
    NAVIGATE: 'navigate',
    GET_CURRENT: 'getCurrent',
  },
  PLATFORM: {
    GET_TYPE: 'getType',
  },
  DEVICE: {
    LOCATION: 'location',
    CAMERA: 'camera',
    GALLERY: 'gallery',
    FILES: 'files',
    BIOMETRIC: 'biometric',
    NOTIFICATIONS: 'notifications',
    NETWORK: 'network',
    STORAGE: 'storage',
    INFO: 'info',
  },
  HTTP: {
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    PATCH: 'patch',
    DELETE: 'delete',
  },
  EVENT: {
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe',
    EMIT: 'emit',
  },
  HANDSHAKE: {
    CONNECT: 'connect',
  },
} as const;
