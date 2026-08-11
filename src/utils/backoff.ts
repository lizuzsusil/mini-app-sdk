/**
 * Computes how long to wait before the given retry attempt.
 *
 * Delay doubles with each attempt (`baseMs * 2^attempt`), capped at
 * `maxMs`, then a random amount of jitter (up to 30% of that delay) is
 * added on top. The jitter matters once a namespace/action starts timing
 * out for a lot of mini apps at once (e.g. the host briefly restarts) —
 * without it, every retry would land on the host at exactly the same
 * moment, attempt after attempt, which is the thing you the least want during
 * a recovery.
 *
 * `attempt` is 0-indexed: the delay before the *first* retry uses `attempt = 0`.
 */

/**
 * Returns the delay (in milliseconds) before the next retry.
 *
 * The delay grows exponentially with each retry:
 *   baseMs, baseMs * 2, baseMs * 4, ...
 *
 * It never exceeds `maxMs`. After calculating the delay, a random jitter
 * of up to 30% is added. This spreads retries out over time so that many
 * clients don't all retry at the same moment, which helps reduce a load
 * during outages or service recovery.
 *
 * `attempt` is zero-based, so `attempt = 0` is the delay before the first retry.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
): number {
  const exponential = baseMs * 2 ** attempt;
  const capped = Math.min(exponential, maxMs);
  const jitter = capped * 0.3 * Math.random();
  return Math.round(capped + jitter);
}
