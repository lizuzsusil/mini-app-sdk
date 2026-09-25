import type { SewaPlatformSdk } from "./SewaPlatformSdk";

const instances = new Map<string, SewaPlatformSdk>();

const GLOBAL_KEY = "__SEWA_SDK__";

function writeGlobal(instance: SewaPlatformSdk | null): void {
  try {
    if (typeof globalThis === "undefined") return;
    const g = globalThis as unknown as Record<string, unknown>;
    if (instance) {
      g[GLOBAL_KEY] = instance;
    } else if (g[GLOBAL_KEY] === instance) {
      delete g[GLOBAL_KEY];
    }
  } catch {
    // globalThis may be non-writable in some embedded runtimes. (ignore it)
  }
}

export function registerInstance(instance: SewaPlatformSdk): void {
  instances.set(instance.miniAppId, instance);
  writeGlobal(instance);
}

export function unregisterInstance(instance: SewaPlatformSdk): void {
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
      const vals = [...instances.values()];
      const last = vals[vals.length - 1];
      if (last) writeGlobal(last);
    }
  } catch {
    // ignore
  }
}

export function getInstance(miniAppId?: string): SewaPlatformSdk | undefined {
  if (miniAppId) return instances.get(miniAppId);
  // return the most recently registererd id when no other key is given
  const values = [...instances.values()];
  return values[values.length - 1];
}

export function getAllInstances(): readonly SewaPlatformSdk[] {
  return [...instances.values()];
}

export function clearInstances(): void {
  instances.clear();
  writeGlobal(null);
}
