import { ACTIONS, HTTP_EVENTS, NAMESPACES } from "../constants";
import { SdkError } from "../errors";
import type { RpcClient } from "../rpc";
import type {
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  ApiUploadProgress,
} from "../types";

export const DEFAULT_API_METHOD = "POST" as const;

/**
 * Generic `api.request` — the single entry point for unary + streaming.
 *
 * Only the positional form is supported: `request("POST", { ... })`.
 * - `method` defaults to `POST`; `stream` defaults to `false` (unary).
 * - `stream: true` opens a live stream via `rpc.sendStreamRequest` — chat SSE
 *   text and file/binary bytes share this path; the mini app interprets the
 *   chunks. Init is just a unary call (no extra flag).
 * - `endpoint`/`query` ride along for proxied file calls; endpoint-free
 *   bodies stay opaque — no per-mini-app validation lives here.
 * - Legacy `method: "STREAM"` (and `stream: { signal }`) from older bundles
 *   is remapped to `stream: true` so they keep working.
 */
export function createApiModule(rpc: RpcClient): ApiSdkModule {
  const run = async <T = unknown>(
    method: string = DEFAULT_API_METHOD,
    params: ApiRequestParams<unknown> = {},
  ): Promise<ApiResult<T> | unknown> => {
    if (typeof method !== "string") {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message:
          'Use request("POST", { ... }) — the object form is no longer supported.',
      });
    }

    let stream = false;
    let signal = params.signal;
    const streamOpt = params.stream;
    if (streamOpt !== undefined && streamOpt !== null) {
      if (typeof streamOpt === "object") {
        // Deprecated legacy shape `stream: { signal }`.
        stream = true;
        signal = streamOpt.signal ?? signal;
      } else {
        stream = streamOpt === true;
      }
    }

    let resolvedMethod = (method ?? DEFAULT_API_METHOD).toUpperCase();
    if (resolvedMethod === "STREAM") {
      // Deprecated legacy sentinel — streaming is `stream: true` now.
      resolvedMethod = DEFAULT_API_METHOD;
      stream = true;
    }

    const payload: Record<string, unknown> = { method: resolvedMethod };
    if (params.endpoint !== undefined) payload.endpoint = params.endpoint;
    if (params.query !== undefined) payload.query = params.query;
    if (params.body !== undefined) payload.body = params.body;
    if (params.headers !== undefined) payload.headers = params.headers;

    const withProgress = <R>(task: () => Promise<R>): Promise<R> => {
      const onProgress = params.onProgress;
      if (!onProgress) return task();
      const unsubscribe = rpc.onEvent<ApiUploadProgress>(
        HTTP_EVENTS.UPLOAD_PROGRESS,
        (progress) => {
          onProgress(progress);
        },
      );
      const done = (): void => {
        unsubscribe?.();
      };
      return task().then(
        (value) => {
          done();
          return value;
        },
        (error: unknown) => {
          done();
          throw error;
        },
      );
    };

    if (!stream) {
      return withProgress(() =>
        rpc.request<ApiResult<T>>(NAMESPACES.API, ACTIONS.API.REQUEST, payload),
      );
    }

    const builder = await withProgress(() =>
      rpc.sendStreamRequest(
        NAMESPACES.API,
        ACTIONS.API.REQUEST,
        { ...payload, stream: true },
        signal ? { signal } : undefined,
      ),
    );
    return builder as unknown;
  };

  return {
    request: run as ApiSdkModule["request"],
  };
}
