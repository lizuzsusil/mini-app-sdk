import { describe, expect, it } from "vitest";
import type { RpcClient } from "../rpc";
import { ModuleRegistry } from "./module-registry";

// The registry only ever passes `rpc` through to factories — it never calls
// anything on it — so a typed-but-unused stand-in is enough here.
const fakeRpc = {} as RpcClient;

describe("ModuleRegistry", () => {
  it("builds a registered factory into an instance", () => {
    const registry = new ModuleRegistry();
    registry.register("greeter", (rpc) => ({ rpc, greet: () => "hello" }));

    registry.build(fakeRpc);

    expect(registry.get<{ greet(): string }>("greeter")?.greet()).toBe("hello");
  });

  it("has() reflects registered factories even before build()", () => {
    const registry = new ModuleRegistry();
    registry.register("greeter", () => ({}));

    expect(registry.has("greeter")).toBe(true);
    expect(registry.has("missing")).toBe(false);
  });

  it("get() returns undefined for a module that was never registered", () => {
    const registry = new ModuleRegistry();
    registry.build(fakeRpc);

    expect(registry.get("missing")).toBeUndefined();
  });

  it("only builds each factory once, even across multiple build() calls", () => {
    const registry = new ModuleRegistry();
    let callCount = 0;
    registry.register("counter", () => {
      callCount += 1;
      return { id: callCount };
    });

    registry.build(fakeRpc);
    registry.build(fakeRpc);
    registry.build(fakeRpc);

    expect(callCount).toBe(1);
    expect(registry.get<{ id: number }>("counter")?.id).toBe(1);
  });

  it("a factory registered after an earlier build() gets built on the next build() without touching existing instances", () => {
    const registry = new ModuleRegistry();
    registry.register("first", () => ({ tag: "first" }));
    registry.build(fakeRpc);

    const firstInstance = registry.get("first");

    registry.register("second", () => ({ tag: "second" }));
    registry.build(fakeRpc);

    expect(registry.get("first")).toBe(firstInstance);
    expect(registry.get<{ tag: string }>("second")?.tag).toBe("second");
  });

  it("list() returns the names of every built module", () => {
    const registry = new ModuleRegistry();
    registry.register("a", () => ({}));
    registry.register("b", () => ({}));
    registry.build(fakeRpc);

    expect(registry.list().sort()).toEqual(["a", "b"]);
  });

  it("passes the given rpc client through to every factory", () => {
    const registry = new ModuleRegistry();
    const received: unknown[] = [];
    registry.register("probe", (rpc) => {
      received.push(rpc);
      return {};
    });

    registry.build(fakeRpc);

    expect(received).toEqual([fakeRpc]);
  });
});
