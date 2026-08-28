import type { StreamBuilder } from "../stream";

export type {
  Headers,
  HttpBodyRequest,
  HttpDeleteParams,
  HttpGetParams,
  HttpPatchParams,
  HttpPostParams,
  HttpProgress,
  HttpPutParams,
  HttpQueryRequest,
  HttpRequestBase,
  HttpResult,
  HttpUploadOptions,
  Query,
} from "@lizuz/mini-app-types";

export interface HttpSdkModule {
  get<T>(
    params: import("@lizuz/mini-app-types").HttpGetParams,
  ): Promise<import("@lizuz/mini-app-types").HttpResult<T>>;
  post<T, B = unknown>(
    params: import("@lizuz/mini-app-types").HttpPostParams<B>,
    options?: import("@lizuz/mini-app-types").HttpUploadOptions,
  ): Promise<import("@lizuz/mini-app-types").HttpResult<T>>;
  put<T, B = unknown>(
    params: import("@lizuz/mini-app-types").HttpPutParams<B>,
    options?: import("@lizuz/mini-app-types").HttpUploadOptions,
  ): Promise<import("@lizuz/mini-app-types").HttpResult<T>>;
  patch<T, B = unknown>(
    params: import("@lizuz/mini-app-types").HttpPatchParams<B>,
    options?: import("@lizuz/mini-app-types").HttpUploadOptions,
  ): Promise<import("@lizuz/mini-app-types").HttpResult<T>>;
  delete<T>(
    params: import("@lizuz/mini-app-types").HttpDeleteParams,
  ): Promise<import("@lizuz/mini-app-types").HttpResult<T>>;
  stream(params: {
    messages: import("@lizuz/mini-app-types").ChatMessage[];
    options?: import("@lizuz/mini-app-types").ModelCompletionOptions;
    requestOptions?: import("./chat.types").ChatRequestOptions;
  }): Promise<StreamBuilder & AsyncIterable<string | Uint8Array>>;
  getStream(
    params: import("@lizuz/mini-app-types").HttpGetParams,
  ): Promise<StreamBuilder & AsyncIterable<string | Uint8Array>>;
}
