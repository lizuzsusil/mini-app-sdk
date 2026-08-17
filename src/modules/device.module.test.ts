import { describe, expect, it, vi } from "vitest";
import { ACTIONS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import { createDeviceModule } from "./device.module";

function makeModule(capabilities: string[]) {
  const rpc = {
    getCapabilities: () => capabilities,
    request: vi.fn(async () => ({ status: "granted" })),
  } as unknown as RpcClient;
  return { rpc, module: createDeviceModule(rpc) };
}

describe("device module feature detection", () => {
  it("reports supported actions when the device namespace was negotiated", () => {
    const { module } = makeModule(["device", "auth"]);

    expect(module.isSupported("location")).toBe(true);
    expect(module.isSupported("biometric")).toBe(true);
    expect(module.isSupported("network")).toBe(true);
  });

  it("reports unsupported when the device namespace was not negotiated", () => {
    const { module } = makeModule(["auth"]);

    expect(module.isSupported("location")).toBe(false);
    expect(module.isSupported("biometric")).toBe(false);
  });

  it("reports unsupported before any capabilities are known", () => {
    const { module } = makeModule([]);

    expect(module.isSupported("network")).toBe(false);
  });

  it("rejects action names outside the device surface", () => {
    const { module } = makeModule(["device"]);

    expect(module.isSupported("not-a-real-action" as never)).toBe(false);
  });

  it("still proxies the standard device calls unchanged", async () => {
    const { rpc, module } = makeModule(["device"]);

    await module.location();
    expect(rpc.request).toHaveBeenCalledWith(
      NAMESPACES.DEVICE,
      ACTIONS.DEVICE.LOCATION,
      undefined,
    );
  });
});