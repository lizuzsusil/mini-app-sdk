import type {
  GicChatEvent,
  GicChatSession,
  GicChatStreamOptions,
  GicChatStreamRequest,
} from "@lizuz/mini-app-types";
import { ACTIONS, NAMESPACES } from "../constants";
import { SdkError } from "../errors";
import type { RpcClient } from "../rpc";

/**
 * GIC Chat Agent module — session + SSE event streaming per `chat_api_spec.pdf`.
 *
 * - `startSession()` mirrors `POST /start-session` → `{user_id, session_id}`
 * - `stream()` mirrors `POST /stream` with `user_id/session_id/message` (≤200 chars)
 *   and streams back typed `GicChatEvent`s (`tool_call`, `tool_result`, `keep_alive`,
 *   `token{ text }`, `meta{ invocation_id }`, `done`, `error{ detail }`).
 *
 * Transport: host bridges GIC HTTP SSE (`text/event-stream`) to SDK `stream`
 * messages (one `stream` per SSE event, `payload` is JSON stringified `GicChatEvent`).
 * Cancellation via `AbortSignal` or `StreamBuilder.cancel()` notifies host.
 */
export function createGicChatModule(
  rpc: RpcClient,
): import("@lizuz/mini-app-types").GicChatSdkModule {
  const validateMessage = (message: string): void => {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: "message must be non-blank string",
      });
    }
    if (message.length > 200) {
      throw new SdkError({
        code: "INVALID_PARAMS",
        message: "message must be ≤200 characters",
      });
    }
  };

  return {
    async startSession(): Promise<GicChatSession> {
      const result = await rpc.request<GicChatSession>(
        NAMESPACES.GIC_CHAT,
        ACTIONS.GIC_CHAT.START_SESSION,
      );
      if (!result?.user_id || !result?.session_id) {
        throw new SdkError({
          code: "HOST_ERROR",
          message: "Invalid session response from host",
        });
      }
      return result;
    },

    async stream(
      request: GicChatStreamRequest,
      options?: GicChatStreamOptions,
    ): Promise<{ invocation_id?: string }> {
      if (!request?.user_id || !request?.session_id) {
        throw new SdkError({
          code: "INVALID_PARAMS",
          message: "user_id and session_id required",
        });
      }
      validateMessage(request.message);

      const builder = await rpc.sendStreamRequest(
        NAMESPACES.GIC_CHAT,
        ACTIONS.GIC_CHAT.STREAM,
        request,
        options?.signal ? { signal: options.signal } : undefined,
      );

      let invocationId: string | undefined;
      let done = false;
      let errorDetail: string | undefined;

      // StreamBuilder stores string chunks (host sends JSON.stringify(event))
      for await (const chunk of builder.iterate()) {
        const raw =
          typeof chunk === "string"
            ? chunk
            : new TextDecoder().decode(chunk as Uint8Array);
        if (!raw) continue;
        let event: GicChatEvent;
        try {
          event = JSON.parse(raw) as GicChatEvent;
        } catch {
          continue;
        }
        options?.onEvent?.(event);
        if (event.type === "meta" && "invocation_id" in event) {
          invocationId = (event as { invocation_id: string }).invocation_id;
        }
        if (event.type === "done") done = true;
        if (event.type === "error") {
          errorDetail = (event as { detail: string }).detail;
          // StreamBuilder will have been rejected with ProtocolError if host sent error stream;
          // but spec delivers error as event with 200, so we surface as rejection.
          throw new SdkError({
            code: "HOST_ERROR",
            message: errorDetail || "GIC chat stream error",
          });
        }
        if (done) break;
      }

      // Ensure stream completed; if builder rejected, propagate
      await builder.waitUntilDone().catch((err) => {
        if (errorDetail)
          throw new SdkError({
            code: "HOST_ERROR",
            message: errorDetail,
            cause: err,
          });
        throw err;
      });

      return { invocation_id: invocationId };
    },

    async streamText(
      request: GicChatStreamRequest,
      options?: GicChatStreamOptions,
    ): Promise<{ text: string; invocation_id?: string }> {
      let text = "";
      let invocationId: string | undefined;
      const onEvent = (e: GicChatEvent): void => {
        options?.onEvent?.(e);
        if (e.type === "token" && "text" in e)
          text += (e as { text: string }).text;
        if (e.type === "meta" && "invocation_id" in e)
          invocationId = (e as { invocation_id: string }).invocation_id;
      };
      const result = await (async (): Promise<{ invocation_id?: string }> => {
        // Reuse stream logic but with aggregated onEvent
        validateMessage(request.message);
        if (!request.user_id || !request.session_id) {
          throw new SdkError({
            code: "INVALID_PARAMS",
            message: "user_id and session_id required",
          });
        }
        const builder = await rpc.sendStreamRequest(
          NAMESPACES.GIC_CHAT,
          ACTIONS.GIC_CHAT.STREAM,
          request,
          options?.signal ? { signal: options.signal } : undefined,
        );
        let localInvocation: string | undefined;
        for await (const chunk of builder.iterate()) {
          const raw =
            typeof chunk === "string"
              ? chunk
              : new TextDecoder().decode(chunk as Uint8Array);
          if (!raw) continue;
          let ev: GicChatEvent;
          try {
            ev = JSON.parse(raw) as GicChatEvent;
          } catch {
            continue;
          }
          onEvent(ev);
          if (ev.type === "meta")
            localInvocation = (ev as { invocation_id: string }).invocation_id;
          if (ev.type === "error")
            throw new SdkError({
              code: "HOST_ERROR",
              message: (ev as { detail: string }).detail,
            });
          if (ev.type === "done") break;
        }
        await builder.waitUntilDone();
        return { invocation_id: localInvocation };
      })();
      // invocationId from inner or outer
      return { text, invocation_id: result.invocation_id ?? invocationId };
    },
  };
}
