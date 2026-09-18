/** Per-call control knobs for `api.request({ stream: true })`, currently just cancellation. */
export interface ChatRequestOptions {
  /**
   * When provided, aborting the signal cancels the stream (rejecting the
   * returned `StreamBuilder`) and notifies the host to stop generating.
   */
  signal?: AbortSignal;
}
