export interface ApiRequestParams<TBody = unknown> {
  endpoint: string;
  body?: TBody;
  headers?: Record<string, string>;
}

export interface ApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface ApiSdkModule {
  request<T = unknown, B = unknown>(params: ApiRequestParams<B>): Promise<ApiResult<T>>;
}
