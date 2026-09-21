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
 * - `path` (legacy alias: `endpoint`) is required — it becomes the BFF
 *   envelope's inner route. `query` is folded into it as a query string.
 * - The wire `body` IS the BFF envelope `{method, path, body}`; the host
 *   POSTs it verbatim to `{BASE_URI}/api-orchestrate` (unary) or
 *   `{BASE_URI}/sse-orchestrate` (`stream: true`) with zero interpretation.
 * - `stream: true` opens a live stream via `rpc.sendStreamRequest` — raw BFF
 *   bytes the mini app parses (e.g. with `parseSseStream`). Init is just a
 *   unary call (no extra flag).
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

    const innerPath = params.path;
    if (innerPath === undefined) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: 'api.request needs a route: pass { path: "/..." }.',
      });
    }
    let envelopePath = innerPath;
    if (params.query && Object.keys(params.query).length > 0) {
      const search = new URLSearchParams(params.query).toString();
      if (search)
        envelopePath += `${envelopePath.includes("?") ? "&" : "?"}${search}`;
    }

    // The BFF envelope — the host forwards it byte-for-byte.
    const envelope: Record<string, unknown> = {
      method: resolvedMethod,
      path: envelopePath,
    };
    if (params.body !== undefined) envelope.body = params.body;

    const payload: Record<string, unknown> = { body: envelope };
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
