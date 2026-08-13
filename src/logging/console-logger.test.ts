import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleLogger } from "./console-logger";

describe("ConsoleLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes to console.info by default for an info-level message", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new ConsoleLogger();

    logger.info("hello");

    expect(spy).toHaveBeenCalledWith("[MiniAppSdk] hello", "");
  });

  it("drops messages below the configured minLevel", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const logger = new ConsoleLogger({ minLevel: "warn" });

    logger.debug("should not appear");
    logger.info("also should not appear");

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("writes messages at or above minLevel", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = new ConsoleLogger({ minLevel: "warn" });

    logger.warn("a warning");
    logger.error("an error");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("applies a custom prefix", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new ConsoleLogger({ prefix: "[HostSDK]" });

    logger.info("hi");

    expect(spy).toHaveBeenCalledWith("[HostSDK] hi", "");
  });

  it("passes context through as the second argument", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new ConsoleLogger();

    logger.info("hi", { userId: "123" });

    expect(spy).toHaveBeenCalledWith("[MiniAppSdk] hi", { userId: "123" });
  });

  it("redacts matching context keys via a Set", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new ConsoleLogger({
      redact: new Set(["token", "password"]),
    });

    logger.info("hi", { token: "secret", userId: "123" });

    expect(spy).toHaveBeenCalledWith("[MiniAppSdk] hi", {
      token: "[REDACTED]",
      userId: "123",
    });
  });

  it("redacts context keys via a predicate", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new ConsoleLogger({
      redact: (key, value) => key === "secret" || value === "super-sensitive",
    });

    logger.info("hi", { secret: "a", name: "b", note: "super-sensitive" });

    expect(spy).toHaveBeenCalledWith("[MiniAppSdk] hi", {
      secret: "[REDACTED]",
      name: "b",
      note: "[REDACTED]",
    });
  });

  it("leaves context untouched when nothing matches the redaction set", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logger = new ConsoleLogger({ redact: new Set(["token"]) });

    const context = { userId: "123" };
    logger.info("hi", context);

    expect(spy).toHaveBeenCalledWith("[MiniAppSdk] hi", context);
    // The same object is passed through, not a copy.
    expect(spy.mock.calls[0][1]).toBe(context);
  });
});
