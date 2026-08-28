import type { SdkPlugin } from "../client/MiniAppSdk";
import { CONNECTION_EVENTS } from "../constants";
import type { Logger } from "../logging";

export interface OfflineQueueOptions {
  /** Allowlisted namespaces that may be queued when offline. Default: ['storage','api','navigation'] */
  allowlist?: string[];
  maxEntries?: number;
  ttlMs?: number;
}

interface QueuedRequest {
  namespace: string;
  action: string;
  payload?: unknown;
  ts: number;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  options?: { dedupe?: boolean };
}

/**
 * Offline queue plugin. When `navigator.onLine === false` or `connection.lost`
 * has fired, matching requests are enqueued and replayed on `connection.established`
 * or `online` event. Non-allowlisted namespaces fail fast with the original error.
 *
 * Usage:
 * ```ts
 * await sdk.usePlugin(createOfflineQueuePlugin({ allowlist: ['storage'] }));
 * ```
 */
export function createOfflineQueuePlugin(
  options: OfflineQueueOptions = {},
): SdkPlugin {
  const allowlist = new Set(
    options.allowlist ?? ["storage", "api", "navigation"],
  );
  const maxEntries = options.maxEntries ?? 50;
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  let isOnline =
    typeof navigator !== "undefined" ? navigator.onLine !== false : true;
  const queue: QueuedRequest[] = [];
  let sdkRef: { rpc: import("../rpc").RpcClient; logger: Logger } | null = null;

  const prune = (): void => {
    const now = Date.now();
    for (let i = queue.length - 1; i >= 0; i--) {
      const entry = queue[i];
      if (entry && now - entry.ts > ttlMs) {
        entry.reject(new Error("Offline queue entry expired"));
        queue.splice(i, 1);
      }
    }
    while (queue.length > maxEntries) {
      const dropped = queue.shift();
      dropped?.reject(new Error("Offline queue overflow"));
    }
  };

  const flush = async (): Promise<void> => {
    if (!sdkRef || !isOnline) return;
    const toReplay = [...queue];
    queue.length = 0;
    for (const q of toReplay) {
      try {
        const v = await sdkRef.rpc.request(
          q.namespace,
          q.action,
          q.payload,
          q.options,
        );
        q.resolve(v);
      } catch (e) {
        q.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  };

  return {
    name: "offline-queue",
    install(ctx) {
      sdkRef = { rpc: ctx.rpc, logger: ctx.logger };
      // Offline detection via navigator + connection events
      if (typeof window !== "undefined") {
        window.addEventListener("online", () => {
          isOnline = true;
          void flush();
        });
        window.addEventListener("offline", () => {
          isOnline = false;
        });
      }
      ctx.sdk.on(CONNECTION_EVENTS.LOST as unknown as string, () => {
        isOnline = false;
      });
      ctx.sdk.on(CONNECTION_EVENTS.ESTABLISHED as unknown as string, () => {
        isOnline = true;
        void flush();
      });

      // Middleware that queues when offline
      const queueMiddleware = async <T>(
        mwCtx: import("../rpc/middleware").RpcMiddlewareContext,
        next: import("../rpc/middleware").RpcNext<T>,
      ): Promise<T> => {
        prune();
        const shouldQueue = !isOnline && allowlist.has(mwCtx.namespace);
        if (!shouldQueue) return next();
        return new Promise<T>((resolve, reject) => {
          if (queue.length >= maxEntries) {
            reject(new Error("Offline queue at capacity"));
            return;
          }
          queue.push({
            namespace: mwCtx.namespace,
            action: mwCtx.action,
            payload: mwCtx.payload,
            ts: Date.now(),
            resolve: resolve as unknown as (v: unknown) => void,
            reject,
            options: {},
          });
          ctx.logger.info(
            `[offline-queue] Queued ${mwCtx.namespace}.${mwCtx.action} (${queue.length} pending)`,
          );
        });
      };
      ctx.rpc.use(queueMiddleware);
    },
  };
}
