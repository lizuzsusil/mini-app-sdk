import { describe, expect, it, vi } from "vitest";
import { HOST_TARGET } from "../constants";
import { SdkError } from "../errors";
import type { PlatformMessage } from "../protocol";
import { createMessage } from "../protocol";
import type { Transport } from "../transport";
import { MiniAppSdk } from "./MiniAppSdk";

/**
 * A minimal scripted `Transport` for exercising `MiniAppSdk` end-to-end.
 * Auto-responds to `handshake` and `platform.getType` (the two requests
 * `initialize()` always makes) and otherwise queues outbound messages so a
 * test can inspect or respond to them manually. No `window`/DOM involved.
 */
class ScriptedTransport implements Transport {
  readonly sent: PlatformMessage[] = [];
  private onMessage: ((message: PlatformMessage) => void) | null = null;
  private readonly platformType: string;
  private readonly handshakeCapabilities?: string[];

  constructor(platformType: string = "flutter", capabilities?: string[]) {
    this.platformType = platformType;
    this.handshakeCapabilities = capabilities;
  }

  start(onMessage: (message: PlatformMessage) => void): void {
    this.onMessage = onMessage;
  }

  stop(): void {
    this.onMessage = null;
  }

  send(message: PlatformMessage): void {
    this.sent.push(message);

    if (message.type === "handshake") {
      this.reply(
        message,
        this.handshakeCapabilities
          ? { status: "ok", capabilities: this.handshakeCapabilities }
          : { status: "ok" },
      );
      return;
    }
    if (message.namespace === "platform" && message.action === "getType") {
      this.reply(message, this.platformType);
      return;
    }
    if (message.namespace === "appearance") {
      this.reply(
        message,
        message.action === "getLocale"
          ? { locale: "en", language: "en", direction: "ltr" }
          : { preference: "light", mode: "light" },
      );
      return;
    }
    if (message.namespace === "event" && message.action === "subscribe") {
      this.reply(message, undefined);
      return;
    }
    // Every other request is left pending; the test drives the response.
  }

  reply(request: PlatformMessage, payload: unknown): void {
    const response = createMessage(
      "response",
      request.namespace,
      request.action,
      HOST_TARGET,
      request.source,
      payload,
      {
        requestId: request.requestId,
        traceId: request.traceId,
      },
    );
    queueMicrotask(() => this.onMessage?.(response));
  }

  /** Test helper: deliver a host-published event synchronously. */
  deliverEvent(namespace: string, action: string, payload: unknown): void {
    const event = createMessage(
      "event",
      namespace,
      action,
      HOST_TARGET,
      "my-mini-app",
      payload,
    );
    this.onMessage?.(event);
  }
}

describe("MiniAppSdk", () => {
  it("initializes: starts the transport, handshakes, and resolves the platform type", async () => {
    const transport = new ScriptedTransport("flutter");
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });

    await sdk.initialize();

    expect(sdk.platform.type).toBe("flutter");
    expect(sdk.platform.isFlutter()).toBe(true);
    expect(sdk.platform.isMobile()).toBe(true);
    expect(sdk.miniAppId).toBe("my-mini-app");
  });

  it("is idempotent: calling initialize() twice does not re-run the handshake", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });

    await sdk.initialize();
    const handshakeCount = transport.sent.filter(
      (m) => m.type === "handshake",
    ).length;

    await sdk.initialize();
    const handshakeCountAfter = transport.sent.filter(
      (m) => m.type === "handshake",
    ).length;

    expect(handshakeCount).toBe(1);
    expect(handshakeCountAfter).toBe(1);
  });

  it("is concurrency-safe: parallel initialize() calls share one handshake", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });

    await Promise.all([sdk.initialize(), sdk.initialize(), sdk.initialize()]);

    expect(transport.sent.filter((m) => m.type === "handshake")).toHaveLength(
      1,
    );
  });

  it("exposes a working auth module end-to-end", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    expect(request.namespace).toBe("auth");
    expect(request.action).toBe("getUser");

    transport.reply(request, {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      roles: [],
      permissions: [],
    });

    await expect(userPromise).resolves.toMatchObject({ id: "u1", name: "Ada" });
  });

  it("throws SdkError if initialize() is called after destroy()", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    sdk.destroy();

    await expect(sdk.initialize()).rejects.toBeInstanceOf(SdkError);
  });

  it("destroy() is safe to call multiple times", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    expect(() => {
      sdk.destroy();
      sdk.destroy();
    }).not.toThrow();
  });

  it("falls back to DefaultTransport when no transport dependency is provided", () => {
    // DefaultTransport requires `window`; in this Node test environment
    // constructing it should not throw (construction is lazy — only
    // start()/send() touch `window`), proving the SDK still works exactly
    // as before for consumers who don't inject anything.
    expect(() => new MiniAppSdk({ miniAppId: "my-mini-app" })).not.toThrow();
  });

  it("runs a registered middleware around every module call", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const seen: string[] = [];
    sdk.use(async (ctx, next) => {
      seen.push(`${ctx.namespace}.${ctx.action}`);
      return next();
    });

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    transport.reply(request, {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      roles: [],
      permissions: [],
    });
    await userPromise;

    expect(seen).toEqual(["auth.getUser"]);
  });

  it("reports accurate metrics after a mix of successful module calls", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    transport.reply(request, {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      roles: [],
      permissions: [],
    });
    await userPromise;

    const metrics = sdk.getMetrics();
    expect(metrics.totalSuccesses).toBeGreaterThanOrEqual(1);
    expect(metrics.byAction["auth.getUser"]).toMatchObject({
      count: 1,
      successes: 1,
    });
  });

  it("lets a host or vendor register and retrieve a custom module", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    sdk.registerModule("payments", (rpc) => ({
      charge: (amount: number) =>
        rpc.request<{ ok: boolean }>("payments", "charge", { amount }),
    }));

    const payments = sdk.getModule<{
      charge(amount: number): Promise<{ ok: boolean }>;
    }>("payments");
    expect(payments).toBeDefined();

    const chargePromise = payments!.charge(100);
    const request = transport.sent[transport.sent.length - 1]!;
    expect(request.namespace).toBe("payments");
    expect(request.action).toBe("charge");
    transport.reply(request, { ok: true });

    await expect(chargePromise).resolves.toEqual({ ok: true });
  });

  it("exposes built-in modules through getModule() by their namespace name", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    expect(sdk.getModule("auth")).toBe(sdk.auth);
  });

  it("getModule() returns undefined for a module that was never registered", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    expect(sdk.getModule("does-not-exist")).toBeUndefined();
  });

  it("debug.snapshot() reports a serializable view of the instance", async () => {
    const transport = new ScriptedTransport("web");
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const snapshot = sdk.debug.snapshot();
    expect(snapshot).toMatchObject({
      miniAppId: "my-mini-app",
      protocolVersion: "1.0.0",
      platformType: "web",
      status: "ready",
    });
    expect(snapshot.sdkVersion).toBeTruthy();
    expect(snapshot.traceId).toBe(sdk.traceId);
    expect(snapshot.capabilities).toEqual(expect.any(Array));
    expect(snapshot.transport).toMatchObject({ started: true });
    expect(snapshot.pendingRequests).toEqual([]);
    expect(snapshot.registeredModules).toContain("auth");
    expect(snapshot.registeredModules).toContain("http");
  });

  it("debug.snapshot() reflects an in-flight request", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const userPromise = sdk.auth.getUser();
    const snapshot = sdk.debug.snapshot();
    expect(snapshot.pendingRequests).toHaveLength(1);
    expect(snapshot.pendingRequests[0]).toMatchObject({
      namespace: "auth",
      action: "getUser",
    });
    expect(snapshot.pendingRequests[0].elapsedMs).toBeGreaterThanOrEqual(0);

    const request = transport.sent[transport.sent.length - 1]!;
    transport.reply(request, {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      roles: [],
      permissions: [],
    });
    await userPromise;

    expect(sdk.debug.snapshot().pendingRequests).toHaveLength(0);
  });

  it("debug.snapshot() reports the destroyed status after destroy()", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();
    sdk.destroy();

    expect(sdk.debug.snapshot().status).toBe("destroyed");
  });

  it("enables the built-in ConsoleLogger when logLevel is set", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk(
      { miniAppId: "my-mini-app", devMode: false, logLevel: "info" },
      { transport },
    );

    await sdk.initialize();
    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("stays silent on console when no logger, logLevel, or devMode is set", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk(
      { miniAppId: "my-mini-app", devMode: false },
      { transport },
    );

    await sdk.initialize();
    expect(infoSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  it("invokes the metrics export hook on every getMetrics() snapshot", async () => {
    const onSnapshot = vi.fn();
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk(
      { miniAppId: "my-mini-app", metrics: { onSnapshot } },
      { transport },
    );
    await sdk.initialize();

    sdk.getMetrics();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot.mock.calls[0][0]).toMatchObject({
      totalRequests: expect.any(Number),
      percentiles: {
        p50Ms: expect.any(Number),
        p95Ms: expect.any(Number),
        p99Ms: expect.any(Number),
      },
    });
  });

  it("reports latency percentiles in the metrics snapshot", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const userPromise = sdk.auth.getUser();
    const request = transport.sent[transport.sent.length - 1]!;
    transport.reply(request, {
      id: "u1",
      name: "Ada",
      email: "ada@example.com",
      roles: [],
      permissions: [],
    });
    await userPromise;

    const metrics = sdk.getMetrics();
    expect(metrics.byAction["auth.getUser"]!.percentiles).toMatchObject({
      p50Ms: expect.any(Number),
      p95Ms: expect.any(Number),
      p99Ms: expect.any(Number),
    });
    expect(metrics.percentiles).toMatchObject({
      p50Ms: expect.any(Number),
      p95Ms: expect.any(Number),
      p99Ms: expect.any(Number),
    });
  });

  it("feature-detects device capabilities via isSupported", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    // The scripted host reports no capabilities, so the SDK assumes full
    // support — the device namespace counts as negotiated.
    expect(sdk.device.isSupported("location")).toBe(true);
    expect(sdk.device.isSupported("biometric")).toBe(true);
  });

  it("reports isSupported false before initialize() resolves", () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });

    expect(sdk.device.isSupported("location")).toBe(false);
  });

  it("emits a typed event to the host event bus", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    sdk.emit("navigation.route.changed", {
      previous: "/a",
      current: "/b",
      canGoBack: true,
    });

    const sent = transport.sent[transport.sent.length - 1]!;
    expect(sent.namespace).toBe("event");
    expect(sent.action).toBe("emit");
    expect(sent.payload).toEqual({
      event: "navigation.route.changed",
      data: { previous: "/a", current: "/b", canGoBack: true },
    });
  });

  it("replays buffered events to a late sdk.on(..., { replay: true }) subscriber", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    sdk.on("appearance.theme.changed", () => {});
    transport.deliverEvent("appearance", "theme.changed", "dark");
    transport.deliverEvent("appearance", "theme.changed", "light");

    const late = vi.fn();
    sdk.on("appearance.theme.changed", late, { replay: true });
    expect(late.mock.calls.map((call) => call[0])).toEqual(["dark", "light"]);
  });

  it("does not replay buffered events without the replay option", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    sdk.on("appearance.theme.changed", () => {});
    transport.deliverEvent("appearance", "theme.changed", "dark");

    const late = vi.fn();
    sdk.on("appearance.theme.changed", late);
    expect(late).not.toHaveBeenCalled();
  });

  it("exposes the notifications and links modules end-to-end", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const onToken = vi.fn();
    const onNotificationOpen = vi.fn();
    const onLinkOpen = vi.fn();
    sdk.notifications.onToken(onToken);
    sdk.notifications.onOpen(onNotificationOpen);
    sdk.links.onOpen(onLinkOpen);

    transport.deliverEvent("notifications", "token", "push-token-1");
    expect(onToken).toHaveBeenCalledWith("push-token-1");

    transport.deliverEvent("notifications", "opened", {
      url: "https://example.com/a",
      data: { campaign: "summer" },
    });
    expect(onNotificationOpen).toHaveBeenCalledWith({
      url: "https://example.com/a",
      data: { campaign: "summer" },
    });

    transport.deliverEvent("links", "opened", {
      url: "https://example.com/x",
      params: { ref: "push" },
    });
    expect(onLinkOpen).toHaveBeenCalledWith({
      url: "https://example.com/x",
      params: { ref: "push" },
    });
  });

  it("routes notifications.register and links.open through their namespaces", async () => {
    const transport = new ScriptedTransport();
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    const registerPromise = sdk.notifications.register({ requestPermission: true });
    const registerRequest = transport.sent[transport.sent.length - 1]!;
    expect(registerRequest.namespace).toBe("notifications");
    expect(registerRequest.action).toBe("register");
    transport.reply(registerRequest, { enabled: true, token: "tok" });
    await expect(registerPromise).resolves.toMatchObject({
      enabled: true,
      token: "tok",
    });

    const openPromise = sdk.links.open("https://example.com/y", { inApp: false });
    const openRequest = transport.sent[transport.sent.length - 1]!;
    expect(openRequest.namespace).toBe("links");
    expect(openRequest.action).toBe("open");
    expect(openRequest.payload).toEqual({
      url: "https://example.com/y",
      inApp: false,
    });
    transport.reply(openRequest, undefined);
    await expect(openPromise).resolves.toBeUndefined();
  });

  it("gates notifications and links on negotiated capabilities", async () => {
    const transport = new ScriptedTransport("flutter", ["auth", "http"]);
    const sdk = new MiniAppSdk({ miniAppId: "my-mini-app" }, { transport });
    await sdk.initialize();

    expect(sdk.notifications.isSupported()).toBe(false);
    expect(sdk.links.isSupported()).toBe(false);
    expect(sdk.capabilities).toEqual(["auth", "http"]);
  });
});
