import { ACTIONS, NAMESPACES } from '../constants';
import type { RpcClient } from '../rpc';
import type { ApiRequestParams, ApiResult, ApiSdkModule } from '../types';

export function createApiModule(rpc: RpcClient): ApiSdkModule {
  return {
    request: <T = unknown, B = unknown>(params: ApiRequestParams<B>) =>
      rpc.request<ApiResult<T>>(NAMESPACES.API, ACTIONS.API.REQUEST, params),
  };
}
