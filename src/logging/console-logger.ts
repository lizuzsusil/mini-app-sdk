import type { Logger } from "./logger";

export interface ConsoleLoggerOptions {
  /** Minimum level that actually gets written. Anything below this is dropped. Defaults to 'info'. */
  minLevel?: "debug" | "info" | "warn" | "error";
  /** Prefix prepended to every message, useful for telling multiple SDK instances apart in one console. Defaults to '[MiniAppSdk]'. */
  prefix?: string;
  /**
   * Masks sensitive fields in `context` before a line is written. Either a
   * `Set<string>` of top-level keys to redact unconditionally, or a
   * predicate `(key, value) => boolean` for finer control. Redacted values
   * are written as `"[REDACTED]"`. When `deep` is true, nested objects are
   * walked and any matching key at any depth is redacted.
   */
  redact?: Set<string> | ((key: string, value: unknown) => boolean);
  /** When true, `redact` walks nested objects/arrays. Default false (shallow). */
  deep?: boolean;
  /** Optional JSON formatting for host ingestion: when `"json"`, writes line as JSON string. */
  format?: "text" | "json";
}

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const REDACTED_MARKER = "[REDACTED]";

/**
 * The SDK's ready-to-use `Logger` implementation. Not wired in by default —
 * `MiniAppSdk` still defaults to `NoopLogger` so logging stays opt-in — but
 * this is what a mini app or host passes in when it wants to actually see
 * what the SDK is doing:
 *
 * ```ts
 * const sdk = new MiniAppSdk({ miniAppId: 'x' }, {
 *   logger: new ConsoleLogger({ minLevel: 'debug', redact: new Set(['token']) }),
 * });
 * ```
 */
export class ConsoleLogger implements Logger {
  private readonly minLevel: "debug" | "info" | "warn" | "error";
  private readonly prefix: string;
  private readonly redact: ConsoleLoggerOptions["redact"];
  private readonly deep: boolean;
  private readonly format: "text" | "json";

  constructor(options: ConsoleLoggerOptions = {}) {
    this.minLevel = options.minLevel ?? "info";
    this.prefix = options.prefix ?? "[MiniAppSdk]";
    this.redact = options.redact;
    this.deep = options.deep ?? false;
    this.format = options.format ?? "text";
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  private write(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const redacted = this.maybeRedact(context);
    if (this.format === "json") {
      const payload = {
        level,
        prefix: this.prefix,
        message,
        context: redacted,
        ts: Date.now(),
      };
      const line = JSON.stringify(payload);
      switch (level) {
        case "debug":
          console.debug(line);
          break;
        case "info":
          console.info(line);
          break;
        case "warn":
          console.warn(line);
          break;
        case "error":
          console.error(line);
          break;
      }
      return;
    }
    const line = `${this.prefix} ${message}`;
    switch (level) {
      case "debug":
        console.debug(line, redacted ?? "");
        break;
      case "info":
        console.info(line, redacted ?? "");
        break;
      case "warn":
        console.warn(line, redacted ?? "");
        break;
      case "error":
        console.error(line, redacted ?? "");
        break;
    }
  }

  private maybeRedact(
    context?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!context || !this.redact) return context;

    const redact = this.redact;
    const isKeyRedacted = (key: string, value: unknown): boolean =>
      typeof redact === "function" ? redact(key, value) : redact.has(key);

    if (!this.deep) {
      const masked: Record<string, unknown> = {};
      let changed = false;
      for (const [key, value] of Object.entries(context)) {
        if (isKeyRedacted(key, value)) {
          masked[key] = REDACTED_MARKER;
          changed = true;
        } else {
          masked[key] = value;
        }
      }
      return changed ? masked : context;
    }

    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map((v) => walk(v));
      if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (isKeyRedacted(k, v)) out[k] = REDACTED_MARKER;
          else out[k] = walk(v);
        }
        return out;
      }
      return value;
    };

    const masked: Record<string, unknown> = {};
    let changed = false;
    for (const [key, value] of Object.entries(context)) {
      if (isKeyRedacted(key, value)) {
        masked[key] = REDACTED_MARKER;
        changed = true;
      } else {
        const walked = walk(value);
        if (walked !== value) changed = true;
        masked[key] = walked as unknown;
      }
    }
    return changed ? masked : (walk(context) as Record<string, unknown>);
  }
}
