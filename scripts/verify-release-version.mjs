import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? process.env.RELEASE_TAG;
if (!tag) {
  console.error("Usage: node scripts/verify-release-version.mjs vX.Y.Z");
  process.exit(1);
}

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
const tauriVersion = JSON.parse(
  readFileSync(
    new URL("../src-tauri/tauri.conf.json", import.meta.url),
    "utf8",
  ),
).version;
const cargoManifest = readFileSync(
  new URL("../src-tauri/Cargo.toml", import.meta.url),
  "utf8",
);
const cargoVersion = /^\s*version\s*=\s*"([^"]+)"/m.exec(cargoManifest)?.[1];
const expectedTag = `v${packageVersion}`;

const versions = {
  "package.json": packageVersion,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
};
const mismatches = Object.entries(versions).filter(
  ([, version]) => version !== packageVersion,
);

if (mismatches.length > 0 || tag !== expectedTag) {
  console.error("Release version mismatch:");
  for (const [file, version] of Object.entries(versions)) {
    console.error(`  ${file}: ${version ?? "missing"}`);
  }
  console.error(`  requested tag: ${tag}`);
  console.error(`  expected tag: ${expectedTag}`);
  process.exit(1);
}

console.log(`Release versions match ${tag}.`);
