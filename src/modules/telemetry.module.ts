import { ACTIONS, NAMESPACES } from '../constants';
import type { Logger } from '../logging';
import { noopLogger } from '../logging';
import type { RpcClient } from '../rpc';
import type { TelemetryLogLevel, TelemetrySdkModule } from '../types';

/**
 * Telemetry is intentionally fire-and-forget: callers should never have to
 * `await` or `try/catch` a `track()` call. A failed telemetry request is
 * not surfaced to the caller — it's reported to the injected `Logger`
 * instead, so it stays visible to anyone who wires up a real logger without
 * ever bubbling up into application code.
 */
export function createTelemetryModule(rpc: RpcClient, logger: Logger = noopLogger): TelemetrySdkModule {
  const fireAndForget = (namespace: string, action: string, payload: unknown) => {
    rpc.request(namespace, action, payload).catch((error: unknown) => {
      logger.warn(`Telemetry call "${namespace}.${action}" failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  return {
    log: (level: TelemetryLogLevel, message: string, context?: Record<string, unknown>) => {
      fireAndForget(NAMESPACES.TELEMETRY, ACTIONS.TELEMETRY.LOG, { level, message, context });
    },
    track: (event: string, properties?: Record<string, unknown>) => {
      fireAndForget(NAMESPACES.TELEMETRY, ACTIONS.TELEMETRY.TRACK, { event, properties });
    },
    error: (error: string | Error, context?: Record<string, unknown>) => {
      const message = error instanceof Error ? error.message : error;
      fireAndForget(NAMESPACES.TELEMETRY, ACTIONS.TELEMETRY.ERROR, { message, context });
    },
  };
}
