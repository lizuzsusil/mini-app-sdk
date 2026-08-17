import { describe, expect, it, vi } from "vitest";
import { ACTIONS, NAMESPACES, NOTIFICATIONS_EVENTS } from "../constants";
import type { RpcClient } from "../rpc";
import { createNotificationsModule } from "./notifications.module";

function makeModule(capabilities: string[]) {
  const rpc = {
    getCapabilities: () => capabilities,
    request: vi.fn(async () => ({ enabled: true, token: "push-token" })),
    onEvent: vi.fn(() => () => {}),
  } as unknown as RpcClient;
  return { rpc, module: createNotificationsModule(rpc) };
}

describe("notifications module", () => {
  it("reports supported when the notifications namespace was negotiated", () => {
    const { module } = makeModule(["notifications", "auth"]);

    expect(module.isSupported()).toBe(true);
  });

  it("reports unsupported when the notifications namespace was not negotiated", () => {
    const { module } = makeModule(["auth"]);

    expect(module.isSupported()).toBe(false);
  });

  it("registers with the host via notifications.register", async () => {
    const { rpc, module } = makeModule(["notifications"]);

    await module.register({ requestPermission: true });

    expect(rpc.request).toHaveBeenCalledWith(
      NAMESPACES.NOTIFICATIONS,
      ACTIONS.NOTIFICATIONS.REGISTER,
      { requestPermission: true },
    );
  });

  it("subscribes to the token and opened events", () => {
    const { rpc, module } = makeModule(["notifications"]);

    module.onToken(vi.fn());
    module.onOpen(vi.fn());

    expect(rpc.onEvent).toHaveBeenCalledWith(
      NOTIFICATIONS_EVENTS.TOKEN,
      expect.any(Function),
    );
    expect(rpc.onEvent).toHaveBeenCalledWith(
      NOTIFICATIONS_EVENTS.OPENED,
      expect.any(Function),
    );
  });

  it("returns an unsubscribe function from each event subscription", () => {
    const unsubscribe = vi.fn();
    const rpc = {
      getCapabilities: () => ["notifications"],
      request: vi.fn(async () => ({ enabled: true })),
      onEvent: vi.fn(() => unsubscribe),
    } as unknown as RpcClient;
    const module = createNotificationsModule(rpc);

    const off = module.onToken(vi.fn());
    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});