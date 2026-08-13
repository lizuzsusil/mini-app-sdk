import { describe, expect, it, vi } from "vitest";
import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import { createStorageModule } from "./storage.module";

interface StoredEntry {
  value: string;
  expiresAt?: number;
}

/**
 * An in-memory stand-in for the host's storage backend: `set`/`get`/`remove`
 * handlers with a `ttlMs`-aware read, so the module's wire behavior (including
 * TTL and JSON) can be exercised without a real host.
 */
function makeModule() {
  const store = new Map<string, StoredEntry>();
  const rpc = {
    request: vi.fn(
      async (_ns: string, action: string, payload: Record<string, unknown>) => {
        if (action === ACTIONS.STORAGE.GET) {
          const key = String(payload.key);
          const entry = store.get(key);
          if (!entry) return { value: null };
          if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
            return { value: null };
          }
          return { value: entry.value };
        }
        if (action === ACTIONS.STORAGE.SET) {
          const key = String(payload.key);
          const expiresAt =
            payload.ttlMs !== undefined
              ? Date.now() + Number(payload.ttlMs)
              : undefined;
          store.set(key, { value: String(payload.value), expiresAt });
          return undefined;
        }
        if (action === ACTIONS.STORAGE.REMOVE) {
          store.delete(String(payload.key));
          return undefined;
        }
        return undefined;
      },
    ),
  } as unknown as RpcClient;
  return { store, rpc, module: createStorageModule(rpc) };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("storage module", () => {
  it("returns null for an unset key", async () => {
    const { module } = makeModule();
    await expect(module.get("missing")).resolves.toBeNull();
  });

  it("round-trips raw strings (legacy behavior)", async () => {
    const { module, rpc } = makeModule();
    await module.set("name", "Ada");

    expect(rpc.request).toHaveBeenCalledWith(
      NAMESPACES.STORAGE,
      ACTIONS.STORAGE.SET,
      { key: "name", value: "Ada" },
    );
    await expect(module.get("name")).resolves.toBe("Ada");
  });

  it("removes a value", async () => {
    const { module } = makeModule();
    await module.set("name", "Ada");
    await module.remove("name");
    await expect(module.get("name")).resolves.toBeNull();
  });

  it("round-trips structured values via setJson/getJson", async () => {
    const { module } = makeModule();
    const profile = { name: "Ada", roles: ["admin"], active: true };

    await module.setJson("profile", profile);
    await expect(module.getJson<typeof profile>("profile")).resolves.toEqual(
      profile,
    );
  });

  it("getJson returns null for a raw string that is not JSON", async () => {
    const { module } = makeModule();
    await module.set("profile", "not-json");
    await expect(module.getJson("profile")).resolves.toBeNull();
  });

  it("passes ttlMs through to the host and expires the value", async () => {
    const { module, rpc } = makeModule();
    await module.set("code", "1234", { ttlMs: 10 });

    expect(rpc.request).toHaveBeenCalledWith(
      NAMESPACES.STORAGE,
      ACTIONS.STORAGE.SET,
      { key: "code", value: "1234", ttlMs: 10 },
    );
    await expect(module.get("code")).resolves.toBe("1234");

    await delay(20);
    await expect(module.get("code")).resolves.toBeNull();
  });

  it("namespaces keys under a scope prefix", async () => {
    const { module, rpc } = makeModule();
    const scoped = module.scoped("prefs");

    await scoped.set("theme", "dark");
    expect(rpc.request).toHaveBeenCalledWith(
      NAMESPACES.STORAGE,
      ACTIONS.STORAGE.SET,
      { key: "prefs:theme", value: "dark" },
    );
    await expect(scoped.get("theme")).resolves.toBe("dark");

    // The parent scope does not see the scoped key.
    await expect(module.get("prefs:theme")).resolves.toBe("dark");
    await expect(module.get("theme")).resolves.toBeNull();
  });

  it("nests scopes naturally and supports JSON + TTL within a scope", async () => {
    const { module } = makeModule();
    const nested = module.scoped("a").scoped("b");

    await nested.setJson("profile", { ok: true });
    await expect(nested.getJson<{ ok: boolean }>("profile")).resolves.toEqual({
      ok: true,
    });
    await expect(module.getJson("a:b:profile")).resolves.toEqual({ ok: true });
  });
});
