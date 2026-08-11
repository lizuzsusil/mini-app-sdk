import type { StreamChunk } from "@lizuz/mini-app-types";

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
 */
export class StreamBuilder {
  private readonly chunks = new Map<number, Uint8Array | string>();
  private resolved = false;
  private rejected = false;

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
    if (chunk.last) {
      this.resolved = true;
      this.resolve?.([...this.chunks.values()]);
    }
  }

  /** True once the final chunk has been received. */
  get isDone(): boolean {
    return this.resolved;
  }

  /** True once the stream has been failed (via error chunk, transport, or timeout). */
  get isRejected(): boolean {
    return this.rejected;
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
}
