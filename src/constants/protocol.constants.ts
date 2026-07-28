/**
 * The protocol/wire version this SDK build speaks.
 * Bumped whenever the shape of `PlatformMessage` changes in a
 * backward-incompatible way. Phase 1 stamps every message with this value
 * but does not yet negotiate it against the host (see Phase 2).
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Value written to `PlatformMessage.channel`. Used by hosts to distinguish
 * SDK protocol messages from unrelated `postMessage` traffic on the same
 * window.
 */
export const MESSAGE_CHANNEL = 'gov-platform-sdk';

/**
 * Name of the `CustomEvent` a host may dispatch as a secondary inbound
 * channel (used by non-`postMessage` hosts, e.g. a Flutter WebView bridge
 * that cannot easily synthesize a `MessageEvent`).
 */
export const PLATFORM_EVENT_NAME = 'gov-platform-event';

/**
 * The logical identity of the host application on the other end of the
 * transport. Every outbound request/handshake message is addressed to this
 * target.
 */
export const HOST_TARGET = 'shell';

/**
 * Wildcard target: a host broadcasting to every connected mini app uses this
 * value instead of a specific `moduleId`.
 */
export const BROADCAST_TARGET = '*';

/**
 * Global key the shell sets before mounting a mini-app with the static host
 * descriptor (type, version, capabilities, sdkVersion). The SDK reads this
 * at construction time. See `HostDescriptor` in `types/platform.types.ts`.
 */
export const HOST_DESCRIPTOR_GLOBAL_KEY = '__GSA_HOST_DESCRIPTOR__';
