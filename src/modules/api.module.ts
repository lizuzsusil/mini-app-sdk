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
