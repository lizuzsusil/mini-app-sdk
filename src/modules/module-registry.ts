import type { RpcClient } from "../rpc";

export type ModuleFactory<T = unknown> = (rpc: RpcClient) => T;
export type LazyModuleFactory<T = unknown> = () =>
  | Promise<ModuleFactory<T>>
  | ModuleFactory<T>;

export class ModuleRegistry {
  private readonly factories = new Map<string, ModuleFactory>();
  private readonly lazyFactories = new Map<string, LazyModuleFactory>();
  private readonly instances = new Map<string, unknown>();

  register<T>(name: string, factory: ModuleFactory<T>): void {
    this.factories.set(name, factory as ModuleFactory);
  }

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

  build(rpc: RpcClient): void {
    for (const [name, factory] of this.factories) {
      if (!this.instances.has(name)) {
        this.instances.set(name, factory(rpc));
      }
    }
  }

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

  list(): string[] {
    return [...this.instances.keys()];
  }
}
