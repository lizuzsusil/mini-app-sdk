import type { Logger } from "./logger";

export class NoopLogger implements Logger {
  debug(): void {}

  info(): void {}

  warn(): void {}

  error(): void {}
}

export const noopLogger: Logger = new NoopLogger();
