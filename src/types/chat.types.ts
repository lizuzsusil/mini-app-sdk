/** Per-call control knobs for `http.stream()` (generic chat via HTTP.CHAT_STREAM), currently just cancellation. */
export interface ChatRequestOptions {
  /**
   * When provided, aborting the signal cancels the stream (rejecting the
   * returned `StreamBuilder`) and notifies the host to stop generating.
   */
  signal?: AbortSignal;
}
