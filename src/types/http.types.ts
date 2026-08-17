import type { StreamBuilder } from "../stream";

export type Headers = Record<string, string>;
export type Query = Record<string, string>;

export interface HttpRequestBase {
  endpoint?: string;
  headers?: Headers;
}

export interface HttpQueryRequest extends HttpRequestBase {
  query?: Query;
}

export interface HttpBodyRequest<TBody = unknown> extends HttpRequestBase {
  body?: TBody;
}

export type HttpGetParams = HttpQueryRequest;
export type HttpDeleteParams = HttpRequestBase;
export type HttpPostParams<T = unknown> = HttpBodyRequest<T>;
export type HttpPutParams<T = unknown> = HttpBodyRequest<T>;
export type HttpPatchParams<T = unknown> = HttpBodyRequest<T>;

export interface HttpResult<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
}

/** Progress reported during an upload, delivered via `HttpUploadOptions.onProgress`. */
export interface HttpProgress {
  uploadedBytes: number;
  /** The host-reported total size when it knows it up front. */
  totalBytes?: number;
}

/** Extra knobs for upload-carrying verbs (`post`/`put`/`patch`). */
export interface HttpUploadOptions {
  /**
   * Invoked as the host reports upload progress. The SDK mirrors the host's
   * `http.uploadProgress` event onto this callback; the host decides how
   * granular the updates are. No callback = no progress subscription.
   */
  onProgress?: (progress: HttpProgress) => void;
}

export interface HttpSdkModule {
  get<T>(params: HttpGetParams): Promise<HttpResult<T>>;
  post<T, B = unknown>(
    params: HttpPostParams<B>,
    options?: HttpUploadOptions,
  ): Promise<HttpResult<T>>;
  put<T, B = unknown>(
    params: HttpPutParams<B>,
    options?: HttpUploadOptions,
  ): Promise<HttpResult<T>>;
  patch<T, B = unknown>(
    params: HttpPatchParams<B>,
    options?: HttpUploadOptions,
  ): Promise<HttpResult<T>>;
  delete<T>(params: HttpDeleteParams): Promise<HttpResult<T>>;
  /**
   * A streamed GET for large downloads or SSE: routed through the same
   * stream machinery as `ai.chat`, so the response arrives chunk-by-chunk
   * and the returned `StreamBuilder` reports progress and supports
   * cancellation.
   */
  getStream(params: HttpGetParams): Promise<StreamBuilder>;
}
