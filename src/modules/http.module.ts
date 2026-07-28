import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type {
  HttpDeleteParams,
  HttpGetParams,
  HttpPatchParams,
  HttpPostParams,
  HttpPutParams,
  HttpResult,
  HttpSdkModule,
} from '../types';

export function createHttpModule(rpc: RpcClient): HttpSdkModule {
  return {
    get: <T = unknown>(params: HttpGetParams) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.GET, params),

    post: <T = unknown, B = unknown>(params: HttpPostParams<B>) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.POST, params),

    put: <T = unknown, B = unknown>(params: HttpPutParams<B>) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.PUT, params),

    patch: <T = unknown, B = unknown>(params: HttpPatchParams<B>) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.PATCH, params),

    delete: <T = unknown>(params: HttpDeleteParams) =>
      rpc.request<HttpResult<T>>(NAMESPACES.HTTP, ACTIONS.HTTP.DELETE, params),
  };
}
