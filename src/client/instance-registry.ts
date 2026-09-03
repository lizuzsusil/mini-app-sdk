import type { MiniAppSdk } from "./MiniAppSdk";

/**
 * Central registry for SDK instances. Unifies the two historical
 * “singletons”: `window.__GSA_SDK__` (used by the CDN IIFE `src/cdn.ts`)
 * and the module-scoped `activeInstance` in `src/index.ts`.
 *
 * - Instances are keyed by `miniAppId` so future multi-mini-app-per-tab
 *   scenarios remain possible.
 * - The registry mirrors the instance to `globalThis.__GSA_SDK__` (the
 *   CDN global) for backward compatibility — consumers reading
 *   `window.__GSA_SDK__` directly keep working during the transition.
 * - Safe for non-browser / SSR contexts where `window` / `globalThis` are
 *   unavailable or frozen.
 */
const instances = new Map<string, MiniAppSdk>();

const GLOBAL_KEY = "__GSA_SDK__";

function writeGlobal(instance: MiniAppSdk | null): void {
  try {
    if (typeof globalThis === "undefined") return;
    const g = globalThis as unknown as Record<string, unknown>;
    if (instance) {
      g[GLOBAL_KEY] = instance;
    } else {
      // Clear the global if it holds any SDK instance (including a destroyed one).
      // The previous check `g[GLOBAL_KEY] === instance` compared against `null`
      // and never deleted a destroyed instance left on the global, causing
      // `readSdkInstance` to return a destroyed instance on the next open.
      if (GLOBAL_KEY in g) {
        delete g[GLOBAL_KEY];
      }
    }
  } catch {
    // globalThis may be non-writable in some embedded runtimes — ignore.
  }
}

export function registerInstance(instance: MiniAppSdk): void {
  instances.set(instance.miniAppId, instance);
  writeGlobal(instance);
}

export function unregisterInstance(instance: MiniAppSdk): void {
  if (instances.get(instance.miniAppId) === instance) {
    instances.delete(instance.miniAppId);
  }
  try {
    if (
      typeof globalThis !== "undefined" &&
      (globalThis as unknown as Record<string, unknown>)[GLOBAL_KEY] ===
        instance
    ) {
      writeGlobal(null);
      // If other instances remain, expose the most recent one on the global.
      const vals = [...instances.values()];
      const last = vals[vals.length - 1];
      if (last) writeGlobal(last);
    }
  } catch {
    // ignore
  }
}

export function getInstance(miniAppId?: string): MiniAppSdk | undefined {
  if (miniAppId) return instances.get(miniAppId);
  // Return most recently registered when no key is given — matches legacy
  // `getMiniAppSdk()` semantics.
  const values = [...instances.values()];
  return values[values.length - 1];
}

export function getAllInstances(): readonly MiniAppSdk[] {
  return [...instances.values()];
}

export function clearInstances(): void {
  instances.clear();
  writeGlobal(null);
  clearActiveInstance();
}

// ---------------------------------------------------------------------------
// Module-scoped active instance (previously in src/index.ts) — moved here so
// `MiniAppSdk.destroy()` can clear it. Delegates to the same map/global so
// the CDN IIFE and helper trio share one backing store.
// ---------------------------------------------------------------------------
let activeInstance: MiniAppSdk | null = null;

export function setActiveInstance(instance: MiniAppSdk | null): void {
  activeInstance = instance;
}

export function getActiveInstance(): MiniAppSdk | null {
  return activeInstance ?? getInstance() ?? null;
}

export function clearActiveInstance(): void {
  activeInstance = null;
}

export function clearActiveInstanceIf(instance: MiniAppSdk): void {
  if (activeInstance === instance) activeInstance = null;
}
