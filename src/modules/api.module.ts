import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type {
  ApiRequestParams,
  ApiResult,
  ApiSdkModule,
  HttpMethod,
} from "../types";

export function createApiModule(rpc: RpcClient): ApiSdkModule {
  return {
    request: <T = unknown, B = unknown>(params?: ApiRequestParams<B>) => {
      const method: HttpMethod = params?.method ?? "POST";
      const body = params?.body;
      const headers = params?.headers;
      return rpc.request<ApiResult<T>>(NAMESPACES.API, ACTIONS.API.REQUEST, {
        method,
        ...(body !== undefined && { body }),
        ...(headers !== undefined && { headers }),
      });
    },
  };
}
