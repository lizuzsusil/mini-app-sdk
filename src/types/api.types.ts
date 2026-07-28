export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiRequestParams<TBody = unknown> = {
  method?: 'POST';
  body: { method: 'POST'; path: string } & TBody;
  headers?: Record<string, string>;
} | {
  method?: Exclude<HttpMethod, 'POST'>;
  body?: TBody;
  headers?: Record<string, string>;
};

export interface ApiResult<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export interface ApiSdkModule {
  request<T = unknown, B = unknown>(params?: ApiRequestParams<B>): Promise<ApiResult<T>>;
}
