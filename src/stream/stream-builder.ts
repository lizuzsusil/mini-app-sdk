import type { StreamChunk } from "sewa-platform-types";
import { StreamCancelledError } from "../errors";

export class StreamBuilder {
  private readonly chunks = new Map<number, Uint8Array | string>();
  private resolved = false;
  private rejected = false;

  private receivedBytesCount = 0;
  private receivedChunksCount = 0;
  private totalCount = 0;

  //Hook the RPC layer sets to notify the host that this stream is being cancelled.
  private onCancelCallback: (() => void) | null = null;

  private readonly promise = new Promise<(Uint8Array | string)[]>(
    (resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    },
  );

  private resolve?: (chunks: (Uint8Array | string)[]) => void;
  private reject?: (err: Error) => void;

  private readonly progressWaiters = new Set<() => void>();

  private notifyProgress(): void {
    if (this.progressWaiters.size === 0) return;
    const waiters = [...this.progressWaiters];
    this.progressWaiters.clear();
    for (const wake of waiters) wake();
  }

  private waitForProgress(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.progressWaiters.add(resolve);
    });
  }

  // resolve when the stream response complete
  waitUntilDone(): Promise<void> {
    return this.promise.then(() => {});
  }

  addChunk(chunk: StreamChunk): void {
    if (this.resolved || this.rejected) return;
    this.chunks.set(chunk.index, chunk.data);
    this.receivedChunksCount = this.chunks.size;

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

  get isDone(): boolean {
    return this.resolved;
  }

  get isRejected(): boolean {
    return this.rejected;
  }

  get receivedChunks(): number {
    return this.receivedChunksCount;
  }

  get receivedBytes(): number {
    return this.receivedBytesCount;
  }

  get total(): number {
    return this.totalCount;
  }

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
      while (yielded.has(cursor) && this.chunks.has(cursor)) cursor++;
      const data = this.chunks.get(cursor);
      if (data === undefined) {
        if (this.resolved) {
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

  rejectChunk(err: Error): void {
    if (this.rejected || this.resolved) return;
    this.rejected = true;
    this.reject?.(err);
    void this.promise.catch(() => undefined);
    this.notifyProgress();
  }

  cancel(error?: Error): void {
    if (this.rejected || this.resolved) return;
    this.rejected = true;
    this.onCancelCallback?.();
    this.reject?.(error ?? new StreamCancelledError());
    void this.promise.catch(() => undefined);
    this.notifyProgress();
  }

  get onCancel(): (() => void) | null {
    return this.onCancelCallback;
  }

  set onCancel(callback: (() => void) | null) {
    this.onCancelCallback = callback;
  }
}
