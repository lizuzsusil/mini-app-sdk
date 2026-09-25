import type {
  AppearanceType,
  PlatformTypeLiteral,
  PlatformTypeResponse,
} from "../types/common.types";
import type { PlatformSdkModule } from "../types/platform.types";

export interface ResolvedPlatformResponse {
  type: PlatformTypeLiteral;
  appearance: AppearanceType | null;
}

export interface PlatformModuleHandle {
  module: PlatformSdkModule;

  setType: (type: PlatformTypeLiteral) => void;

  applyResponse: (raw: unknown) => ResolvedPlatformResponse;
}

const isPlatformType = (value: unknown): value is PlatformTypeLiteral =>
  value === "web" || value === "flutter";

export function normalizePlatformResponse(
  raw: unknown,
  fallbackType: PlatformTypeLiteral,
): ResolvedPlatformResponse {
  if (isPlatformType(raw)) {
    return { type: raw, appearance: null };
  }

  if (raw && typeof raw === "object") {
    const response = raw as PlatformTypeResponse;
    const candidate = response.type ?? response.types;
    const appearance = response.appearance;
    const isHintValue = (value: unknown): boolean =>
      typeof value === "string" || (!!value && typeof value === "object");
    const hasHint =
      !!appearance &&
      typeof appearance === "object" &&
      (isHintValue(appearance.theme) || isHintValue(appearance.locale));

    return {
      type: isPlatformType(candidate) ? candidate : fallbackType,
      appearance: hasHint ? { ...appearance } : null,
    };
  }

  return { type: fallbackType, appearance: null };
}

export function createPlatformModule(
  initialType: PlatformTypeLiteral = "web",
): PlatformModuleHandle {
  let type: PlatformTypeLiteral = initialType;

  const module: PlatformSdkModule = {
    get type() {
      return type;
    },
    isWeb: () => type === "web",
    isFlutter: () => type === "flutter",
    isMobile: () => type === "flutter",
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
