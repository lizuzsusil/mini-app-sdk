import type { StreamChunk } from "@lizuz/mini-app-types";
import { StreamCancelledError } from "../errors";

/**
 * Accumulates the chunks of an in-flight streamed response and hands the
 * assembled result to consumers via a promise and an async iterator.
 *
 * Lifecycle: the `RpcClient` registers a `StreamBuilder` per streamed
 * request, feeds it one `StreamChunk` per inbound `stream` message, and the
 * builder resolves once the host flags the final chunk (`last: true`) or
 * rejects if the host reports an error / the stream times out.
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

  /**
   * A never-rejecting mirror of `promise`, so consumers that only want the
   * chunks produced before a failure (`iterate`) don't have to catch.
   */
  private readonly settledPromise = this.promise.catch(() => {
    this.rejected = true;
    return [];
  });

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
   * Yields every chunk received so far once the stream settles. After a
   * failure this yields nothing (the chunks already buffered before the
   * failure are considered untrustworthy — a mid-stream failure means the
   * response may be incomplete).
   */
  async *iterate(): AsyncIterableIterator<string | Uint8Array> {
    if (this.rejected) return;
    const result = await this.settledPromise;
    if (this.rejected) return;
    for (const chunk of result) {
      yield chunk;
    }
  }

  /** Fails the stream. No further chunks are accepted. */
  rejectChunk(err: Error): void {
    if (this.rejected || this.resolved) return;
    this.rejected = true;
    this.reject?.(err);
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
