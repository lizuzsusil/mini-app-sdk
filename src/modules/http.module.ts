import { ACTIONS, HTTP_EVENTS, NAMESPACES } from "../constants";
import { HttpClientError, HttpServerError } from "../errors";
import type { RpcClient } from "../rpc";
import type {
  HttpDeleteParams,
  HttpGetParams,
  HttpPatchParams,
  HttpPostParams,
  HttpProgress,
  HttpPutParams,
  HttpResult,
  HttpSdkModule,
  HttpUploadOptions,
} from "../types";

/**
 * Shared response mapper for every non-streaming verb: turns an `HttpResult`
 * whose `status` is an error into a typed `SdkError` subclass *inside* the
 * retry loop (via `RpcRequestOptions.mapPayload`), so a 5xx is retried with
 * the normal backoff policy and a 4xx fails fast. A successful status
 * (< 400) passes the result through untouched.
 */
function mapHttpResult(result: unknown): HttpResult {
  const httpResult = result as HttpResult;
  if (typeof httpResult?.status !== "number") {
    return httpResult;
  }
  if (httpResult.status >= 500) {
    throw new HttpServerError({ status: httpResult.status });
  }
  if (httpResult.status >= 400) {
    throw new HttpClientError({ status: httpResult.status });
  }
  return httpResult;
}

/**
 * Runs one upload-carrying request with optional progress mirroring: when
 * `options.onProgress` is set, subscribes to the host's `http.uploadProgress`
 * event for the duration of the request and forwards payloads to the
 * callback, then unsubscribes once the request settles.
 */
async function runUpload<T, B>(
  rpc: RpcClient,
  namespace: string,
  action: string,
  params: HttpPostParams<B>,
  options?: HttpUploadOptions,
): Promise<HttpResult<T>> {
  const unsubscribe = options?.onProgress
    ? rpc.onEvent<HttpProgress>(HTTP_EVENTS.UPLOAD_PROGRESS, (progress) => {
        options.onProgress?.(progress);
      })
    : undefined;
  try {
    return await rpc.request<HttpResult<T>>(namespace, action, params, {
      mapPayload: mapHttpResult,
    });
  } finally {
    unsubscribe?.();
  }
}

export function createHttpModule(rpc: RpcClient): HttpSdkModule {
  return {
    get: <T = unknown>(params: HttpGetParams) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.GET, params, {
        mapPayload: mapHttpResult,
      }),

    post: <T = unknown, B = unknown>(
      params: HttpPostParams<B>,
      options?: HttpUploadOptions,
    ) =>
      runUpload<T, B>(rpc, NAMESPACES.HTTP, ACTIONS.HTTP.POST, params, options),

    put: <T = unknown, B = unknown>(
      params: HttpPutParams<B>,
      options?: HttpUploadOptions,
    ) =>
      runUpload<T, B>(rpc, NAMESPACES.HTTP, ACTIONS.HTTP.PUT, params, options),

    patch: <T = unknown, B = unknown>(
      params: HttpPatchParams<B>,
      options?: HttpUploadOptions,
    ) =>
      runUpload<T, B>(
        rpc,
        NAMESPACES.HTTP,
        ACTIONS.HTTP.PATCH,
        params,
        options,
      ),

    delete: <T = unknown>(params: HttpDeleteParams) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.DELETE, params, {
        mapPayload: mapHttpResult,
      }),

    getStream: (params: HttpGetParams) =>
      rpc.sendStreamRequest(NAMESPACES.HTTP, ACTIONS.HTTP.GET_STREAM, params),
  };
}
