export type ApiRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiUploadProgress {
  uploadedBytes: number;
  totalBytes?: number;
}

export interface ApiRequestParams<TBody = unknown> {
  path?: string;
  endpoint?: string;
  query?: Record<string, string>;
  body?: TBody;
  headers?: Record<string, string>;
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
  request<T = unknown, B = unknown>(
    method: string,
    params: ApiRequestParams<B> & { stream: true },
  ): Promise<T>;
  request<T = unknown, B = unknown>(
    method?: string,
    params?: ApiRequestParams<B>,
  ): Promise<ApiResult<T>>;
}
