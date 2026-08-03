import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function checksumError(message) {
  return new Error(`SHA256SUMS: ${message}`);
}

function compareNames(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

async function writeAtomically(outputPath, contents) {
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, contents, { flag: "wx" });
    await fs.rename(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function generateSha256Sums(directory) {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort(
    compareNames,
  );
  const assets = entries.filter((entry) => entry.name !== "SHA256SUMS");
  if (
    assets.length === 0 ||
    assets.some((entry) => !entry.isFile()) ||
    new Set(assets.map((entry) => entry.name)).size !== assets.length
  ) {
    throw checksumError(
      "release asset directory is empty or contains non-files.",
    );
  }

  const lines = [];
  for (const asset of assets) {
    const file = path.join(directory, asset.name);
    const contents = await fs.readFile(file);
    if (contents.length === 0) {
      throw checksumError(`zero-byte release asset: ${asset.name}`);
    }
    const digest = createHash("sha256").update(contents).digest("hex");
    lines.push(`${digest}  ${asset.name}`);
  }

  const outputPath = path.join(directory, "SHA256SUMS");
  await writeAtomically(outputPath, `${lines.join("\n")}\n`);
}

async function main() {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    throw checksumError(
      "usage: node scripts/generate-sha256sums.mjs <directory>",
    );
  }
  await generateSha256Sums(path.resolve(directory));
  console.log(`Generated ${path.join(directory, "SHA256SUMS")}.`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
