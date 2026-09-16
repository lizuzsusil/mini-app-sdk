import { ACTIONS, NAMESPACES } from "../constants";
import { SdkError } from "../errors";
import type { RpcClient } from "../rpc";
import type { ApiRequestParams, ApiResult, ApiSdkModule } from "../types";

export const DEFAULT_CHAT_CHANNEL = "generic" as const;
export type ChatChannel = "generic" | "gic";

function resolveChannel(body: unknown): ChatChannel {
  const channel = (body as { channel?: unknown } | null)?.channel;
  if (channel === "gic" || channel === "generic") return channel;

  const b = (body ?? {}) as Record<string, unknown>;
  if (
    typeof b.message === "string" &&
    (typeof b.user_id === "string" || typeof b.session_id === "string")
  ) {
    return "gic";
  }
  return DEFAULT_CHAT_CHANNEL;
}

function validateStreamBody(body: unknown): void {
  const b = (body ?? {}) as Record<string, unknown>;
  if (
    typeof b.message === "string" ||
    b.user_id !== undefined ||
    b.session_id !== undefined
  ) {
    if (typeof b.user_id !== "string" || !b.user_id) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: "user_id required for gic streams",
      });
    }
    if (typeof b.session_id !== "string" || !b.session_id) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: "session_id required for gic streams",
      });
    }
    if (typeof b.message !== "string" || b.message.trim().length === 0) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: "message must be non-blank string",
      });
    }
    if (b.message.length > 200) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: "message must be ≤200 characters",
      });
    }
    return;
  }
  const messages = b.messages as unknown;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new SdkError({
      code: "INVALID_PARAMS",
      message: "messages must be a non-empty array",
    });
  }
}

export function createApiModule(rpc: RpcClient): ApiSdkModule {
  return {
    request: (async <T = unknown, B = unknown>(
      params?: ApiRequestParams<B>,
    ) => {
      const raw = params as unknown as
        | {
            method?: string;
            body?: unknown;
            headers?: Record<string, string>;
            stream?: { signal?: AbortSignal };
          }
        | undefined;
      const method = raw?.method ?? "POST";

      if (method === "STREAM") {
        validateStreamBody(raw?.body);
        const channel = resolveChannel(raw?.body);
        return rpc.sendStreamRequest(
          NAMESPACES.API,
          ACTIONS.API.REQUEST,
          {
            method,
            body: {
              ...((raw?.body ?? {}) as Record<string, unknown>),
              channel,
            },
            ...(raw?.headers !== undefined && { headers: raw.headers }),
          },
          raw?.stream?.signal ? { signal: raw.stream.signal } : undefined,
        ) as unknown as Promise<ApiResult<T>>;
      }

      const body = params?.body;
      const headers = params?.headers;
      return rpc.request<ApiResult<T>>(NAMESPACES.API, ACTIONS.API.REQUEST, {
        method,
        ...(body !== undefined && { body }),
        ...(headers !== undefined && { headers }),
      });
    }) as ApiSdkModule["request"],
  };
}
