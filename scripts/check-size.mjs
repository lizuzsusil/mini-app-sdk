import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const bundlePath = fileURLToPath(
  new URL("../dist/sewa-sdk.min.js", import.meta.url),
);
/** Fail the build if the gzipped CDN bundle grows past this. */
const budgetBytes = 30 * 1024;

const bundle = readFileSync(bundlePath);
const rawBytes = bundle.byteLength;
const gzipBytes = gzipSync(bundle).byteLength;

const fmt = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

console.log(
  `sewa-sdk.min.js: ${fmt(rawBytes)} raw, ${fmt(gzipBytes)} gzipped (budget ${fmt(budgetBytes)} gzipped)`,
);

if (gzipBytes > budgetBytes) {
  console.error(
    `Bundle size budget exceeded: ${fmt(gzipBytes)} gzipped > ${fmt(budgetBytes)}`,
  );
  process.exit(1);
}
