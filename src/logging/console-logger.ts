import type { Logger } from './logger';

export interface ConsoleLoggerOptions {
  /** Minimum level that actually gets written. Anything below this is dropped. Defaults to 'info'. */
  minLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Prefix prepended to every message, useful for telling multiple SDK instances apart in one console. Defaults to '[MiniAppSdk]'. */
  prefix?: string;
}

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 } as const;

/**
 * The SDK's ready-to-use `Logger` implementation. Not wired in by default —
 * `MiniAppSdk` still defaults to `NoopLogger` so logging stays opt-in — but
 * this is what a mini app or host passes in when it wants to actually see
 * what the SDK is doing:
 *
 * ```ts
 * const sdk = new MiniAppSdk({ moduleId: 'x' }, { logger: new ConsoleLogger({ minLevel: 'debug' }) });
 * ```
 */
export class ConsoleLogger implements Logger {
  private readonly minLevel: 'debug' | 'info' | 'warn' | 'error';
  private readonly prefix: string;

  constructor(options: ConsoleLoggerOptions = {}) {
    this.minLevel = options.minLevel ?? 'info';
    this.prefix = options.prefix ?? '[MiniAppSdk]';
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  private write(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const line = `${this.prefix} ${message}`;
    switch (level) {
      case 'debug':
        console.debug(line, context ?? '');
        break;
      case 'info':
        console.info(line, context ?? '');
        break;
      case 'warn':
        console.warn(line, context ?? '');
        break;
      case 'error':
        console.error(line, context ?? '');
        break;
    }
  }
}
