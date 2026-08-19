import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Verifies the wire protocol version stays in sync across every copy that
 * ships it. `@lizuz/mini-app-types` is a types-only package (no runtime JS),
 * so the runtime constant is mirrored in the SDK and the host shell; this
 * guard fails the build if those mirrors drift from the shared source of
 * truth.
 */
const sources = [
  {
    name: "mini-app-types (single source of truth)",
    path: "../../mini-app-types/src/constants.ts",
  },
  {
    name: "mini-app-sdk",
    path: "../src/constants/protocol.constants.ts",
  },
  {
    name: "host-platform",
    path: "../../sewa-poc/packages/host-platform/src/constants/protocol.constants.ts",
  },
];

const versionPattern = /PROTOCOL_VERSION\s*=\s*["']([^"']+)["']/;

function readProtocolVersion(path) {
  const filePath = fileURLToPath(new URL(path, import.meta.url));
  try {
    const match = readFileSync(filePath, "utf8").match(versionPattern);
    if (!match) {
      return { filePath, version: null, error: "PROTOCOL_VERSION not found" };
    }
    return { filePath, version: match[1], error: null };
  } catch (error) {
    return {
      filePath,
      version: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const results = sources.map(({ name, path }) => ({
  name,
  ...readProtocolVersion(path),
}));

for (const { name, version } of results) {
  console.log(
    `PROTOCOL_VERSION in ${name}: ${version === null ? "MISSING" : version}`,
  );
}

const firstVersion = results.find((result) => result.version !== null)?.version;

if (firstVersion === undefined) {
  console.error(
    "check-versions: could not read PROTOCOL_VERSION from any source.",
  );
  for (const { name, filePath, error } of results) {
    console.error(`  - ${name} (${filePath}): ${error}`);
  }
  process.exit(1);
}

const diverged = results.filter((result) => result.version !== firstVersion);

if (diverged.length > 0) {
  console.error(
    `check-versions: PROTOCOL_VERSION drift — sources must match "${firstVersion}":`,
  );
  for (const { name, filePath, version, error } of diverged) {
    console.error(`  - ${name} (${filePath}): ${error ?? `"${version}"`}`);
  }
  process.exit(1);
}

console.log("check-versions: PROTOCOL_VERSION is in sync across all sources.");
