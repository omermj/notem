import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseArtifactDefinitions } from "./generate-updater-manifest.mjs";

const PLATFORM_NAMES = new Set([
  "linux-x86_64",
  "darwin-aarch64",
  "windows-x86_64",
]);

function artifactError(message) {
  return new Error(`Release artifacts: ${message}`);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw artifactError(`unexpected argument: ${argument}`);
    }
    const key = argument.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw artifactError(`missing value for --${key.replaceAll("_", "-")}.`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

async function ensureOutputDirectory(outputDirectory) {
  try {
    const entries = await fs.readdir(outputDirectory);
    if (entries.length > 0) {
      throw artifactError(`output directory is not empty: ${outputDirectory}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    await fs.mkdir(outputDirectory, { recursive: true });
  }
}

async function assertArtifactFile(file, name) {
  let stats;
  try {
    stats = await fs.stat(file);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw artifactError(`missing expected artifact: ${name}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw artifactError(`expected artifact is not a regular file: ${name}`);
  }
  if (stats.size === 0) {
    throw artifactError(`zero-byte artifact: ${name}`);
  }
}

async function rejectAmbiguousFiles(sourceRoot, definitions) {
  const expectedByDirectory = new Map();
  for (const definition of definitions) {
    const directory = path.join(sourceRoot, ...definition.source.slice(0, -1));
    const names = expectedByDirectory.get(directory) ?? new Set();
    names.add(definition.name);
    expectedByDirectory.set(directory, names);
  }

  for (const [directory, expectedNames] of expectedByDirectory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.startsWith("NoteM_")) {
        continue;
      }
      if (!entry.isFile()) {
        throw artifactError(
          `ambiguous artifact entry: ${path.join(directory, entry.name)}`,
        );
      }
      if (
        /\.(?:AppImage|AppImage\.sig|deb|dmg|app\.tar\.gz|app\.tar\.gz\.sig|exe|exe\.sig)$/.test(
          entry.name,
        ) &&
        !expectedNames.has(entry.name)
      ) {
        throw artifactError(`unexpected or duplicate artifact: ${entry.name}`);
      }
    }
  }
}

export async function collectReleaseArtifacts({
  platform,
  version,
  sourceRoot,
  outputDirectory,
}) {
  if (!PLATFORM_NAMES.has(platform)) {
    throw artifactError(`unsupported platform ${platform}.`);
  }
  const definitions = releaseArtifactDefinitions(platform, version);
  await rejectAmbiguousFiles(sourceRoot, definitions);
  await ensureOutputDirectory(outputDirectory);

  for (const definition of definitions) {
    const source = path.join(sourceRoot, ...definition.source);
    await assertArtifactFile(source, definition.name);
    await fs.copyFile(source, path.join(outputDirectory, definition.name));
  }
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const required = ["platform", "source_root", "output"];
  for (const name of required) {
    if (!argumentsByName[name]) {
      throw artifactError(`missing required --${name.replaceAll("_", "-")}.`);
    }
  }
  const tag = process.env.RELEASE_TAG;
  if (!tag?.startsWith("v")) {
    throw artifactError(
      "RELEASE_TAG must be an exact version tag beginning with v.",
    );
  }
  const version = tag.slice(1);
  await collectReleaseArtifacts({
    platform: argumentsByName.platform,
    version,
    sourceRoot: path.resolve(argumentsByName.source_root),
    outputDirectory: path.resolve(argumentsByName.output),
  });
  console.log(`Collected exact ${argumentsByName.platform} release artifacts.`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
