import { describe, expect, it, vi } from "vitest";
import { ACTIONS, NAMESPACES, NAVIGATION_EVENTS } from "../constants";
import type { RpcClient } from "../rpc";
import { createNavigationModule } from "./navigation.module";

function makeModule(reply: unknown = undefined) {
  const request = vi.fn(async (_ns: string, action: string) => {
    if (action === ACTIONS.NAVIGATION.GET_CURRENT)
      return { current: "/user/profile", history: ["/user", "/user/profile"] };
    return reply;
  });
  const rpc = { request } as unknown as RpcClient;
  return { request, module: createNavigationModule(rpc) };
}

describe("navigation router", () => {
  it("sends the consumed flag on back", async () => {
    const { request, module } = makeModule({ consumed: true });

    await module.router.back(true);

    expect(request).toHaveBeenCalledWith(
      NAMESPACES.NAVIGATION,
      ACTIONS.NAVIGATION.BACK,
      { consumed: true },
    );
  });

  it("sends the consumed flag on push", async () => {
    const { request, module } = makeModule({ consumed: true });

    await module.router.push(false);

    expect(request).toHaveBeenCalledWith(
      NAMESPACES.NAVIGATION,
      ACTIONS.NAVIGATION.PUSH,
      { consumed: false },
    );
  });

  it("defaults the flag to true when the caller omits it", async () => {
    const { request, module } = makeModule({ consumed: true });

    await module.router.back();
    await module.router.push();

    expect(request).toHaveBeenNthCalledWith(
      1,
      NAMESPACES.NAVIGATION,
      ACTIONS.NAVIGATION.BACK,
      { consumed: true },
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      NAMESPACES.NAVIGATION,
      ACTIONS.NAVIGATION.PUSH,
      { consumed: true },
    );
  });

  it("returns the host's answer when it disagrees with what was requested", async () => {
    const { module } = makeModule({ consumed: false });

    await expect(module.router.back(true)).resolves.toEqual({
      consumed: false,
    });
  });

  it("accepts a bare boolean reply", async () => {
    const { module } = makeModule(false);

    await expect(module.router.back(true)).resolves.toEqual({
      consumed: false,
    });
  });

  it("falls back to the requested flag when the host acknowledges with no payload", async () => {
    const { module } = makeModule(undefined);

    await expect(module.router.back(false)).resolves.toEqual({
      consumed: false,
    });
    await expect(module.router.push(true)).resolves.toEqual({ consumed: true });
  });

  it("drives the native-back flow: pops while history remains, stands down at the root", async () => {
    // The handler a mini app registers on NAVIGATION_EVENTS.BACK_REQUESTED.
    const onBackRequested = async (
      module: ReturnType<typeof makeModule>["module"],
    ) => {
      const { history } = await module.getCurrent();
      return module.router.back(history.length > 1);
    };

    const deep = makeModule({ consumed: true });
    await expect(onBackRequested(deep.module)).resolves.toEqual({
      consumed: true,
    });
    expect(deep.request).toHaveBeenLastCalledWith(
      NAMESPACES.NAVIGATION,
      ACTIONS.NAVIGATION.BACK,
      { consumed: true },
    );

    const atRoot = makeModule({ consumed: false });
    atRoot.request.mockImplementation(async (_ns: string, action: string) => {
      if (action === ACTIONS.NAVIGATION.GET_CURRENT)
        return { current: "/user", history: ["/user"] };
      return { consumed: false };
    });

    await expect(onBackRequested(atRoot.module)).resolves.toEqual({
      consumed: false,
    });
    expect(atRoot.request).toHaveBeenLastCalledWith(
      NAMESPACES.NAVIGATION,
      ACTIONS.NAVIGATION.BACK,
      { consumed: false },
    );
  });

  it("pins the event names the host publishes on", () => {
    expect(NAVIGATION_EVENTS.BACK_REQUESTED).toBe("navigation.back.requested");
    expect(NAVIGATION_EVENTS.ROUTE_CHANGED).toBe("navigation.route.changed");
  });
});
