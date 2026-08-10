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

export interface HttpSdkModule {
  get<T>(params: HttpGetParams): Promise<HttpResult<T>>;
  post<T, B = unknown>(params: HttpPostParams<B>): Promise<HttpResult<T>>;
  put<T, B = unknown>(params: HttpPutParams<B>): Promise<HttpResult<T>>;
  patch<T, B = unknown>(params: HttpPatchParams<B>): Promise<HttpResult<T>>;
  delete<T>(params: HttpDeleteParams): Promise<HttpResult<T>>;
}
