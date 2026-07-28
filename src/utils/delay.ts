/**
 * Resolves after `ms` milliseconds. Used to space out retry attempts.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
