import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assetError(message) {
  return new Error(`Published release assets: ${message}`);
}

async function expectedAssetNames(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  if (entries.length === 0 || entries.some((entry) => !entry.isFile())) {
    throw assetError(
      "expected asset directory is empty or contains non-files.",
    );
  }
  return new Set(entries.map((entry) => entry.name));
}

export async function verifyReleaseAssets({
  expectedDirectory,
  release,
  allowMissing = false,
}) {
  const expected = await expectedAssetNames(expectedDirectory);
  if (!release || release.draft !== true || !Array.isArray(release.assets)) {
    throw assetError("GitHub response is not a draft release with assets.");
  }

  const actual = new Set();
  for (const asset of release.assets) {
    if (
      !asset ||
      typeof asset.name !== "string" ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0
    ) {
      throw assetError("GitHub returned an invalid or empty release asset.");
    }
    if (actual.has(asset.name)) {
      throw assetError(`duplicate release asset: ${asset.name}`);
    }
    if (!expected.has(asset.name)) {
      throw assetError(`unexpected release asset: ${asset.name}`);
    }
    actual.add(asset.name);
  }

  if (!allowMissing) {
    const missing = [...expected].filter((name) => !actual.has(name));
    if (missing.length > 0) {
      throw assetError(`missing release asset: ${missing.join(", ")}`);
    }
  }
}

function parseArguments(argv) {
  const allowMissingIndex = argv.indexOf("--allow-missing");
  const allowMissing = allowMissingIndex !== -1;
  if (allowMissing) argv.splice(allowMissingIndex, 1);
  if (
    argv.length !== 4 ||
    argv[0] !== "--expected" ||
    argv[2] !== "--release-json"
  ) {
    throw assetError(
      "usage: node scripts/verify-release-assets.mjs --expected <directory> --release-json <file> [--allow-missing]",
    );
  }
  return { expected: argv[1], releaseJson: argv[3], allowMissing };
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const release = JSON.parse(
    await fs.readFile(argumentsByName.releaseJson, "utf8"),
  );
  await verifyReleaseAssets({
    expectedDirectory: path.resolve(argumentsByName.expected),
    release,
    allowMissing: argumentsByName.allowMissing,
  });
  console.log("Verified exact draft release assets.");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
