/**
 * Generates a unique identifier. Prefers `crypto.randomUUID()` where
 * available (all modern browsers and WebViews) and falls back to a
 * timestamp+random string for older/embedded JS engines.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
