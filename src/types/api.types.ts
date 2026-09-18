/**
 * Generic `api.request` contract — single entry point for unary + streaming.
 *
 * - `method` defaults to `'POST'`.
 * - `stream` defaults to `false` (unary). `true` opens a live stream consumed
 *   via the returned `StreamBuilder` (async iteration). Init is just a unary
 *   call — no extra flag.
 * - `endpoint`/`query` let file/binary calls ride the same method; chat calls
 *   stay endpoint-free with semantic `body` shapes owned by each mini app.
 */
export type ApiRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiUploadProgress {
  uploadedBytes: number;
  totalBytes?: number;
}

export interface ApiRequestParams<TBody = unknown> {
  /** Proxied file/http calls — when present the host fetches this URL. */
  endpoint?: string;
  query?: Record<string, string>;
  body?: TBody;
  headers?: Record<string, string>;
  /**
   * Defaults to `false` (unary). `true` opens a live stream (chat SSE text or
   * file/binary bytes — the mini app interprets the chunks).
   * The object form is deprecated legacy (`stream: { signal }`).
   */
  stream?: boolean | { signal?: AbortSignal };
  signal?: AbortSignal;
  onProgress?: (progress: ApiUploadProgress) => void;
}

export interface ApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface ApiSdkModule {
  /**
   * Streaming request: `request("POST", { ..., stream: true })` returns the
   * host stream (consume via `iterate()` or async iteration).
   */
  request<T = unknown, B = unknown>(
    method: string,
    params: ApiRequestParams<B> & { stream: true },
  ): Promise<T>;
  /**
   * Unary request: `request("POST", { ... })`. `POST` is the default method,
   * streaming is off by default (covers init + normal calls).
   */
  request<T = unknown, B = unknown>(
    method?: string,
    params?: ApiRequestParams<B>,
  ): Promise<ApiResult<T>>;
}
