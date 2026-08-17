import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

const renames = [
  ["index.js", "sewa-sdk.js"],
  ["index.js.map", "sewa-sdk.js.map"],
  ["index.mjs", "sewa-sdk.mjs"],
  ["index.mjs.map", "sewa-sdk.mjs.map"],
];

for (const [from, to] of renames) {
  renameSync(join(dist, from), join(dist, to));
}

// tsup writes the sourceMappingURL comment (and the maps' "file" field)
// against the pre-rename filenames; rewrite them so the shipped bundles
// point at the renamed maps.
const commentFixes = [
  ["sewa-sdk.js", "index.js.map", "sewa-sdk.js.map"],
  ["sewa-sdk.mjs", "index.mjs.map", "sewa-sdk.mjs.map"],
];
for (const [file, from, to] of commentFixes) {
  const path = join(dist, file);
  writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
}

const mapFixes = [
  ["sewa-sdk.js.map", '"file":"index.js"', '"file":"sewa-sdk.js"'],
  ["sewa-sdk.mjs.map", '"file":"index.mjs"', '"file":"sewa-sdk.mjs"'],
];
for (const [file, from, to] of mapFixes) {
  const path = join(dist, file);
  writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
}
