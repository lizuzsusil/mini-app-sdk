/** Knobs for `LinksSdkModule.open()`. */
export interface LinksOpenOptions {
  /**
   * When true, asks the host to open the link inside the host app rather
   * than handing off to the system browser.
   */
  inApp?: boolean;
}

/** Payload of `links.opened`: a deep link the host resolved into this mini app. */
export interface LinksOpenedEvent {
  url: string;
  /** Query/route params the host extracted from the link, when available. */
  params?: Record<string, unknown>;
}

/**
 * The deep-links module. `open()` asks the host to open an external URL;
 * `onOpen` subscribes to deep links that point back *into* the mini app.
 * Gated on the `links` capability — check `isSupported()` (or
 * `sdk.capabilities`) before calling `open()`.
 */
export interface LinksSdkModule {
  /** Whether the host negotiated the `links` namespace during the handshake. */
  isSupported(): boolean;
  /** Asks the host to open a URL. Rejects if the host can't handle it. */
  open(url: string, options?: LinksOpenOptions): Promise<void>;
  /**
   * Subscribes to deep links resolved into this mini app. Returns an
   * unsubscribe function.
   */
  onOpen(handler: (event: LinksOpenedEvent) => void): () => void;
}
