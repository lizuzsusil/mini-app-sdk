/** Options accepted by `set` / `setJson`. */
export interface StorageSetOptions {
  /**
   * Time-to-live in milliseconds. The host may drop the value once this
   * expires; a `get` after expiry returns `null`. Optional and additive — a
   * host that doesn't honor it simply stores the value without an expiry.
   */
  ttlMs?: number;
}

/**
 * The storage module. `get`/`set` operate on raw strings (the legacy, host
 * wire format); `getJson`/`setJson` add transparent JSON (de)serialization on
 * top of the same wire, and `scoped(prefix)` returns a sub-module whose keys
 * are all namespaced under `prefix:` so distinct features of a mini app can't
 * collide.
 */
export interface StorageSdkModule {
  /** Returns the raw string value for `key`, or `null` when unset. */
  get(key: string): Promise<string | null>;
  /**
   * Returns the JSON-decoded value for `key`. `null` when unset or when the
   * stored string is not valid JSON (which is also the raw-string case).
   */
  getJson<T = unknown>(key: string): Promise<T | null>;
  /** Stores a raw string under `key`. */
  set(key: string, value: string, options?: StorageSetOptions): Promise<void>;
  /** Serializes `value` to JSON and stores it under `key`. */
  setJson(
    key: string,
    value: unknown,
    options?: StorageSetOptions,
  ): Promise<void>;
  /** Removes the value for `key`. */
  remove(key: string): Promise<void>;
  /**
   * Returns a sub-module whose keys are all prefixed with `${prefix}:`, so a
   * feature can read/write without worrying about colliding with another
   * feature's keys. `scoped` calls nest naturally (`a.scoped("b").scoped("c")`
   * yields `a:b:c:key`).
   */
  scoped(prefix: string): StorageSdkModule;
}
