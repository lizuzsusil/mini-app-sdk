import type { RpcClient } from "../rpc";

export type ModuleFactory<T = unknown> = (rpc: RpcClient) => T;
export type LazyModuleFactory<T = unknown> = () =>
  | Promise<ModuleFactory<T>>
  | ModuleFactory<T>;

/**
 * Holds a set of `(rpc) => module` factories and, once built, the module
 * instances they produced. `MiniAppSdk` uses this internally to construct
 * its nine built-in modules — each one is `register()`ed by name instead of
 * being new'd inline in the composition root's constructor — and the same
 * registry is what backs `sdk.registerModule()` / `sdk.getModule()`, so a
 * host or vendor can add a module the SDK doesn't ship without forking
 * anything.
 *
 * A registry only ever builds a given name once: `build()` iterates every
 * factory that hasn't produced an instance yet, so registering a new
 * module after `initialize()` and calling `build()` again only constructs
 * the new one, leaving already-built modules untouched.
 */
export class ModuleRegistry {
  private readonly factories = new Map<string, ModuleFactory>();
  private readonly lazyFactories = new Map<string, LazyModuleFactory>();
  private readonly instances = new Map<string, unknown>();

  /**
   * Registers a factory under `name`. Registering a second factory under a
   * name that's already been built has no effect on the existing instance —
   * call `get()` to check first if that matters for your use case.
   */
  register<T>(name: string, factory: ModuleFactory<T>): void {
    this.factories.set(name, factory as ModuleFactory);
  }

  /**
   * Registers a lazy factory that is only resolved on first `get()` /
   * `buildAsync()`. Useful for tree-shakable per-module entry points.
   * The factory may return a `ModuleFactory` synchronously or via `import()`.
   */
  registerLazy<T>(name: string, factory: LazyModuleFactory<T>): void {
    if (this.instances.has(name) || this.factories.has(name)) return;
    this.lazyFactories.set(name, factory as LazyModuleFactory);
  }

  has(name: string): boolean {
    return (
      this.factories.has(name) ||
      this.lazyFactories.has(name) ||
      this.instances.has(name)
    );
  }

  /** Instantiates every registered factory that hasn't been built yet. */
  build(rpc: RpcClient): void {
    for (const [name, factory] of this.factories) {
      if (!this.instances.has(name)) {
        this.instances.set(name, factory(rpc));
      }
    }
  }

  /** Async variant that also resolves lazy factories. */
  async buildAsync(rpc: RpcClient): Promise<void> {
    this.build(rpc);
    for (const [name, lazy] of this.lazyFactories) {
      if (this.instances.has(name)) continue;
      const factory = await lazy();
      this.instances.set(name, (factory as ModuleFactory)(rpc));
    }
    this.lazyFactories.clear();
  }

  get<T>(name: string): T | undefined {
    return this.instances.get(name) as T | undefined;
  }

  /** Async get that resolves a lazy factory if needed. */
  async getAsync<T>(name: string, rpc: RpcClient): Promise<T | undefined> {
    const existing = this.get<T>(name);
    if (existing) return existing;
    const lazy = this.lazyFactories.get(name);
    if (!lazy) return undefined;
    const factory = await lazy();
    const instance = (factory as ModuleFactory<T>)(rpc);
    this.instances.set(name, instance);
    this.lazyFactories.delete(name);
    return instance;
  }

  /** Names of every module that has been built so far. */
  list(): string[] {
    return [...this.instances.keys()];
  }
}
