import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import type { StorageSdkModule, StorageSetOptions } from "../types";

interface StorageRpcResult {
  value: string | null;
}

interface StorageRpcSetPayload {
  key: string;
  value: string;
  ttlMs?: number;
}

/**
 * The storage module. `get`/`set` speak the raw-string wire format exactly as
 * before; `getJson`/`setJson` layer JSON (de)serialization on top of that same
 * wire, and `scoped(prefix)` returns a sub-module that prefixes every key.
 */
export function createStorageModule(rpc: RpcClient): StorageSdkModule {
  const rawGet = (key: string): Promise<string | null> =>
    rpc
      .request<StorageRpcResult>(NAMESPACES.STORAGE, ACTIONS.STORAGE.GET, {
        key,
      })
      .then((result) => result?.value ?? null);

  const rawSet = (
    key: string,
    value: string,
    options?: StorageSetOptions,
  ): Promise<void> => {
    const payload: StorageRpcSetPayload = { key, value };
    if (options?.ttlMs !== undefined) payload.ttlMs = options.ttlMs;
    return rpc.request<void>(NAMESPACES.STORAGE, ACTIONS.STORAGE.SET, payload);
  };

  const rawRemove = (key: string): Promise<void> =>
    rpc.request<void>(NAMESPACES.STORAGE, ACTIONS.STORAGE.REMOVE, { key });

  const getJson = async <T = unknown>(key: string): Promise<T | null> => {
    const raw = await rawGet(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // The stored string isn't JSON (a raw-string value). Null is the honest
      // answer — it's indistinguishable from "unset" from the caller's view.
      return null;
    }
  };

  const setJson = (
    key: string,
    value: unknown,
    options?: StorageSetOptions,
  ): Promise<void> => rawSet(key, JSON.stringify(value), options);

  const scoped = (prefix: string): StorageSdkModule => {
    const prefixKey = (key: string): string => `${prefix}:${key}`;
    return {
      get: (key: string) => rawGet(prefixKey(key)),
      getJson: <T = unknown>(key: string) => getJson<T>(prefixKey(key)),
      set: (key: string, value: string, options?: StorageSetOptions) =>
        rawSet(prefixKey(key), value, options),
      setJson: (key: string, value: unknown, options?: StorageSetOptions) =>
        setJson(prefixKey(key), value, options),
      remove: (key: string) => rawRemove(prefixKey(key)),
      scoped: (nested: string) => scoped(prefixKey(nested)),
    };
  };

  const getMany = async (keys: string[]): Promise<Array<string | null>> => {
    const results = await rpc.batch(
      keys.map((key) => ({
        namespace: NAMESPACES.STORAGE,
        action: ACTIONS.STORAGE.GET,
        payload: { key },
      })),
    );
    return results.map((r) => {
      if (r.ok)
        return ((r.value as StorageRpcResult)?.value ?? null) as string | null;
      return null;
    });
  };

  const getManyJson = async <T = unknown>(
    keys: string[],
  ): Promise<Array<T | null>> => {
    const raws = await getMany(keys);
    return raws.map((raw) => {
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    });
  };

  return {
    get: rawGet,
    getJson,
    set: rawSet,
    setJson,
    remove: rawRemove,
    scoped,
    getMany: getMany as unknown as StorageSdkModule["get"] extends (
      ...args: unknown[]
    ) => unknown
      ? unknown
      : never,
    getManyJson: getManyJson as unknown as StorageSdkModule["get"] extends (
      ...args: unknown[]
    ) => unknown
      ? unknown
      : never,
  } as StorageSdkModule & {
    getMany(keys: string[]): Promise<Array<string | null>>;
    getManyJson<T>(keys: string[]): Promise<Array<T | null>>;
  };
}
