import type {
  ChatMessage,
  ModelCompletionOptions,
} from "@lizuz/mini-app-types";
import type { StreamBuilder } from "../stream";

/** Per-call control knobs for `chat()`, currently just cancellation. */
export interface ChatRequestOptions {
  /**
   * When provided, aborting the signal cancels the stream (rejecting the
   * returned `StreamBuilder`) and notifies the host to stop generating.
   */
  signal?: AbortSignal;
}

/**
 * The AI/chat module. `chat()` streams the host model's completion back
 * chunk-by-chunk rather than waiting for one monolithic response — the
 * returned `StreamBuilder` starts accumulating chunks immediately, and the
 * caller consumes them via `builder.iterate()` or awaits whole-stream
 * completion with `builder.waitUntilDone()`.
 */
export interface ChatSdkModule {
  chat(
    messages: ChatMessage[],
    options?: ModelCompletionOptions,
    requestOptions?: ChatRequestOptions,
  ): Promise<StreamBuilder>;
}
