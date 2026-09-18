import type { StreamChunk } from "@lizuz/mini-app-types";
import { StreamCancelledError } from "../errors";

/**
 * Accumulates the chunks of an in-flight streamed response and hands them
 * to consumers via a promise and a live async iterator.
 *
 * Lifecycle: the `RpcClient` registers a `StreamBuilder` per streamed
 * request, feeds it one `StreamChunk` per inbound `stream` message, and the
 * builder resolves once the host flags the final chunk (`last: true`) or
 * rejects if the host reports an error / the stream times out.
 *
 * `iterate()` yields each chunk as it arrives (in index order, so an
 * out-of-order delivery still reads sequentially) — consumers render
 * progressively. A consumer that starts after completion replays the
 * assembled chunks. Retransmissions of an already-yielded index are
 * dropped for live consumers; late consumers see the latest value per
 * index.
 *
 * Failure semantics: the iterator never throws. If the stream fails before
 * a consumer yields anything, it yields nothing (buffered chunks are
 * considered untrustworthy); chunks already yielded stay yielded. Terminal
 * failures surface via `waitUntilDone()`.
 *
 * This class is intentionally transport-agnostic: it holds no reference to
 * `RpcClient`, `Transport`, or the wire format — chunks in, result out.
 * Cancellation follows the same rule: `cancel()` rejects the stream locally
 * and invokes the `onCancel` hook if one was set, but the hook — which is
 * what tells the host to stop producing — is the RPC layer's responsibility
 * to wire up.
 */
export class StreamBuilder {
  private readonly chunks = new Map<number, Uint8Array | string>();
  private resolved = false;
  private rejected = false;

  private receivedBytesCount = 0;
  private receivedChunksCount = 0;
  private totalCount = 0;

  /** Hook the RPC layer sets to notify the host that this stream is being cancelled. */
  private onCancelCallback: (() => void) | null = null;

  private readonly promise = new Promise<(Uint8Array | string)[]>(
    (resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    },
  );

  private resolve?: (chunks: (Uint8Array | string)[]) => void;
  private reject?: (err: Error) => void;

  /** Wakers for live `iterate()` consumers waiting on the next chunk. */
  private readonly progressWaiters = new Set<() => void>();

  private notifyProgress(): void {
    if (this.progressWaiters.size === 0) return;
    const waiters = [...this.progressWaiters];
    this.progressWaiters.clear();
    for (const wake of waiters) wake();
  }

  private waitForProgress(): Promise<void> {
    // Synchronous subscribe: callers check state first without awaiting in
    // between, so no arrival can slip through before this registers.
    return new Promise<void>((resolve) => {
      this.progressWaiters.add(resolve);
    });
  }

  /** Resolves when the stream completes, or rejects if it fails mid-stream. */
  waitUntilDone(): Promise<void> {
    return this.promise.then(() => {});
  }

  /** Records one inbound chunk. Chunks are keyed by `index` (out-of-order delivery is safe). */
  addChunk(chunk: StreamChunk): void {
    if (this.resolved || this.rejected) return;
    this.chunks.set(chunk.index, chunk.data);
    this.receivedChunksCount = this.chunks.size;

    // Recomputed on every chunk so a retransmission (same index) doesn't
    // double-count bytes. String length is UTF-16 code units — close enough
    // for progress reporting; the host's `total` (when sent) is authoritative.
    let bytes = 0;
    for (const data of this.chunks.values()) {
      bytes += data instanceof Uint8Array ? data.byteLength : data.length;
    }
    this.receivedBytesCount = bytes;

    if (chunk.total !== undefined) this.totalCount = chunk.total;

    if (chunk.last) {
      this.resolved = true;
      this.resolve?.([...this.chunks.values()]);
    }
    this.notifyProgress();
  }

  /** True once the final chunk has been received. */
  get isDone(): boolean {
    return this.resolved;
  }

  /** True once the stream has been failed (via error chunk, transport, timeout, or cancellation). */
  get isRejected(): boolean {
    return this.rejected;
  }

  /** Total number of distinct chunks received so far (deduplicated by index). */
  get receivedChunks(): number {
    return this.receivedChunksCount;
  }

  /** Total bytes received so far across all distinct chunks. */
  get receivedBytes(): number {
    return this.receivedBytesCount;
  }

  /** The stream's overall size as reported by the host via `streamTotal`, or 0 if it never sent one. */
  get total(): number {
    return this.totalCount;
  }

  /**
   * Yields each chunk live as it arrives, in index order. A consumer that
   * starts after completion replays the assembled chunks (latest value per
   * index). Never throws: on failure it simply stops, yielding nothing
   * further — terminal failures surface via `waitUntilDone()`.
   */
  async *iterate(): AsyncIterableIterator<string | Uint8Array> {
    const yielded = new Set<number>();
    let cursor: number | null = null;
    for (;;) {
      if (this.rejected) return;
      if (cursor === null) {
        if (this.chunks.size === 0) {
          if (this.resolved) return;
          await this.waitForProgress();
          continue;
        }
        cursor = Math.min(...this.chunks.keys());
      }
      // Skip retransmissions of already-yielded indices.
      while (yielded.has(cursor) && this.chunks.has(cursor)) cursor++;
      const data = this.chunks.get(cursor);
      if (data === undefined) {
        if (this.resolved) {
          // Done with gaps unfilled — replay leftovers in index order.
          const rest = [...this.chunks.keys()]
            .filter((k) => !yielded.has(k))
            .sort((a, b) => a - b);
          if (rest.length === 0) return;
          cursor = rest[0] as number;
          continue;
        }
        await this.waitForProgress();
        continue;
      }
      yielded.add(cursor);
      yield data;
      cursor++;
    }
  }

  /** Fails the stream. No further chunks are accepted. */
  rejectChunk(err: Error): void {
    if (this.rejected || this.resolved) return;
    this.rejected = true;
    this.reject?.(err);
    // The internal promise may have no `waitUntilDone()` consumer —
    // suppress unhandled-rejection noise (state stays observable via
    // `isRejected`, and the live iterator simply stops).
    void this.promise.catch(() => undefined);
    this.notifyProgress();
  }

  /**
   * Cancels the stream: rejects it with a `StreamCancelledError` (or the
   * provided error) and fires the `onCancel` hook the RPC layer installed, so
   * the host is told to stop producing. Safe to call more than once; only the
   * first call has any effect.
   */
  cancel(error?: Error): void {
    if (this.rejected || this.resolved) return;
    this.rejected = true;
    this.onCancelCallback?.();
    this.reject?.(error ?? new StreamCancelledError());
    void this.promise.catch(() => undefined);
    this.notifyProgress();
  }

  /**
   * Internal hook used by the RPC layer: invoked when the mini app cancels the
   * stream via `cancel()`, giving the layer a chance to notify the host (e.g.
   * send an `ai.cancel` request) before the stream settles. Transport-agnostic
   * here — the hook's semantics belong entirely to whoever installs it.
   */
  get onCancel(): (() => void) | null {
    return this.onCancelCallback;
  }

  set onCancel(callback: (() => void) | null) {
    this.onCancelCallback = callback;
  }
}
