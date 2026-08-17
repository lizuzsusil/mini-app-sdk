import { describe, expect, it, vi } from "vitest";
import { ACTIONS, LINKS_EVENTS, NAMESPACES } from "../constants";
import type { RpcClient } from "../rpc";
import { createLinksModule } from "./links.module";

function makeModule(capabilities: string[]) {
  const rpc = {
    getCapabilities: () => capabilities,
    request: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => {}),
  } as unknown as RpcClient;
  return { rpc, module: createLinksModule(rpc) };
}

describe("links module", () => {
  it("reports supported when the links namespace was negotiated", () => {
    const { module } = makeModule(["links", "auth"]);

    expect(module.isSupported()).toBe(true);
  });

  it("reports unsupported when the links namespace was not negotiated", () => {
    const { module } = makeModule(["auth"]);

    expect(module.isSupported()).toBe(false);
  });

  it("opens a URL with the host", async () => {
    const { rpc, module } = makeModule(["links"]);

    await module.open("https://example.com/x", { inApp: true });

    expect(rpc.request).toHaveBeenCalledWith(NAMESPACES.LINKS, ACTIONS.LINKS.OPEN, {
      url: "https://example.com/x",
      inApp: true,
    });
  });

  it("opens a URL without options", async () => {
    const { rpc, module } = makeModule(["links"]);

    await module.open("https://example.com/x");

    expect(rpc.request).toHaveBeenCalledWith(NAMESPACES.LINKS, ACTIONS.LINKS.OPEN, {
      url: "https://example.com/x",
    });
  });

  it("subscribes to inbound link resolution via links.opened", () => {
    const { rpc, module } = makeModule(["links"]);

    module.onOpen(vi.fn());

    expect(rpc.onEvent).toHaveBeenCalledWith(
      LINKS_EVENTS.OPENED,
      expect.any(Function),
    );
  });
});