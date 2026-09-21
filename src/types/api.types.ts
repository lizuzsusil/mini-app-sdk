/**
 * Generic `api.request` contract — single entry point for unary + streaming.
 *
 * - `method` defaults to `'POST'`. It describes the mini app's inner intent
 *   and travels inside the BFF envelope (the host transport is always POST).
 * - `path` is the BFF inner route (e.g. `/chat/stream`). Required — the BFF
 *   cannot route without it. `endpoint` is the deprecated alias.
 * - `query`, when present, is folded into the envelope path as a query
 *   string so no routing information is lost in transit.
 * - `stream` defaults to `false` (unary). `true` opens a live stream consumed
 *   via the returned `StreamBuilder` (raw BFF bytes — parse them with
 *   `parseSseStream`). Init is just a unary call — no extra flag.
 * - The SDK wraps `{method, path, body}` into the BFF envelope and puts it
 *   in the wire `body`; the host POSTs it verbatim without interpretation.
 */
export type ApiRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiUploadProgress {
  uploadedBytes: number;
  totalBytes?: number;
}

export interface ApiRequestParams<TBody = unknown> {
  /** BFF inner route (e.g. `/chat/stream`). Required. */
  path?: string;
  /** @deprecated Use `path`. Mapped into the envelope when `path` is absent. */
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
