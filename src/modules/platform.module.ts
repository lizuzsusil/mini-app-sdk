import type { PlatformSdkModule } from '../types/platform.types';
import type {
  AppearanceType,
  PlatformTypeLiteral,
  PlatformTypeResponse,
} from '../types/common.types';

/** What a `platform.getType` reply resolves to once normalized. */
export interface ResolvedPlatformResponse {
  type: PlatformTypeLiteral;
  /** `null` when the host sent no appearance hint (e.g. the web shell). */
  appearance: AppearanceType | null;
}

export interface PlatformModuleHandle {
  /** The public-facing module, satisfying `PlatformSdkModule` exactly — no extra methods. */
  module: PlatformSdkModule;
  /**
   * Internal setter used only by the composition root (`MiniAppSdk`) once
   * the actual platform type is known (fetched from the host during
   * `initialize()`). Not part of `PlatformSdkModule`, so it cannot be
   * called by consumer code even though it closes over the same state.
   */
  setType: (type: PlatformTypeLiteral) => void;
  /**
   * Applies a raw `platform.getType` reply — bare string or
   * `PlatformTypeResponse` — and returns the resolved type plus any
   * appearance hint that rode along with it. The hint is handed back rather
   * than stored here: appearance state belongs to the appearance module,
   * this module only relays what the platform handshake happened to carry.
   */
  applyResponse: (raw: unknown) => ResolvedPlatformResponse;
}

const isPlatformType = (value: unknown): value is PlatformTypeLiteral =>
  value === 'web' || value === 'flutter';

/**
 * Normalizes whatever the host answered `platform.getType` with. The web
 * shell replies with a bare `"web"`; the Flutter shell replies with
 * `{ types: 'flutter', appearance: { theme, locale } }` because it has no
 * `appearance` namespace of its own. Anything unrecognized falls back to the
 * current type so a malformed reply can't leave the module in a bogus state.
 */
export function normalizePlatformResponse(
  raw: unknown,
  fallbackType: PlatformTypeLiteral,
): ResolvedPlatformResponse {
  if (isPlatformType(raw)) {
    return { type: raw, appearance: null };
  }

  if (raw && typeof raw === 'object') {
    const response = raw as PlatformTypeResponse;
    const candidate = response.type ?? response.types;
    const appearance = response.appearance;
    const hasHint =
      !!appearance &&
      typeof appearance === 'object' &&
      (typeof appearance.theme === 'string' || typeof appearance.locale === 'string');

    return {
      type: isPlatformType(candidate) ? candidate : fallbackType,
      appearance: hasHint ? { ...appearance } : null,
    };
  }

  return { type: fallbackType, appearance: null };
}

/**
 * `platform` holds one piece of local mutable state — `type` — which isn't
 * known until the host responds during `initialize()`, so it can't be
 * fetched fresh per call like the other modules do. That state lives
 * entirely inside this closure; nothing outside this file can change it
 * except through the `setType`/`applyResponse` handle returned alongside the
 * module.
 */
export function createPlatformModule(initialType: PlatformTypeLiteral = 'web'): PlatformModuleHandle {
  let type: PlatformTypeLiteral = initialType;

  const module: PlatformSdkModule = {
    get type() {
      return type;
    },
    isWeb: () => type === 'web',
    isFlutter: () => type === 'flutter',
    isMobile: () => type === 'flutter',
  };

  const setType = (newType: PlatformTypeLiteral): void => {
    type = newType;
  };

  return {
    module,
    setType,
    applyResponse: (raw: unknown) => {
      const resolved = normalizePlatformResponse(raw, type);
      setType(resolved.type);
      return resolved;
    },
  };
}
