import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { releaseArtifactDefinitions } from "./generate-updater-manifest.mjs";

const ARTIFACT_DIRECTORIES = {
  "installers-linux-x64": "linux-x86_64",
  "installers-macos-arm64": "darwin-aarch64",
  "installers-windows-x64": "windows-x86_64",
};

function stagingError(message) {
  return new Error(`Release asset staging: ${message}`);
}

function expectedDefinitions(version) {
  return Object.entries(ARTIFACT_DIRECTORIES).flatMap(
    ([artifactDirectory, platform]) =>
      releaseArtifactDefinitions(platform, version).map((definition) => ({
        ...definition,
        artifactDirectory,
      })),
  );
}

async function prepareDirectory(directory) {
  try {
    const entries = await fs.readdir(directory);
    if (entries.length > 0) {
      throw stagingError(`output directory is not empty: ${directory}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    await fs.mkdir(directory, { recursive: true });
  }
}

async function assertNonEmptyRegularFile(file, name) {
  let stats;
  try {
    stats = await fs.lstat(file);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw stagingError(`missing expected artifact: ${name}`);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw stagingError(`artifact is not a regular file: ${name}`);
  }
  if (stats.size === 0) {
    throw stagingError(`zero-byte artifact: ${name}`);
  }
}

async function validateDownloadedArtifact(inputDirectory, definitions) {
  const expectedByDirectory = new Map();
  for (const definition of definitions) {
    const names =
      expectedByDirectory.get(definition.artifactDirectory) ?? new Set();
    names.add(definition.name);
    expectedByDirectory.set(definition.artifactDirectory, names);
  }

  const topLevel = await fs.readdir(inputDirectory, { withFileTypes: true });
  const expectedDirectories = new Set(expectedByDirectory.keys());
  const actualDirectories = new Set(topLevel.map((entry) => entry.name));
  if (
    topLevel.some((entry) => !entry.isDirectory()) ||
    actualDirectories.size !== expectedDirectories.size ||
    [...expectedDirectories].some((name) => !actualDirectories.has(name)) ||
    [...actualDirectories].some((name) => !expectedDirectories.has(name))
  ) {
    throw stagingError(
      "downloaded platform artifact directories are incomplete or unexpected.",
    );
  }

  for (const [artifactDirectory, expectedNames] of expectedByDirectory) {
    const directory = path.join(inputDirectory, artifactDirectory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const actualNames = new Set(entries.map((entry) => entry.name));
    if (
      entries.some((entry) => !entry.isFile()) ||
      actualNames.size !== expectedNames.size ||
      [...expectedNames].some((name) => !actualNames.has(name)) ||
      [...actualNames].some((name) => !expectedNames.has(name))
    ) {
      throw stagingError(
        `artifact names for ${artifactDirectory} are incomplete or unexpected.`,
      );
    }
    for (const name of expectedNames) {
      await assertNonEmptyRegularFile(path.join(directory, name), name);
    }
  }
}

export async function stageReleaseAssets({
  inputDirectory,
  outputDirectory,
  updaterDirectory,
  version,
}) {
  const definitions = expectedDefinitions(version);
  await validateDownloadedArtifact(inputDirectory, definitions);
  await prepareDirectory(outputDirectory);
  await prepareDirectory(updaterDirectory);

  for (const definition of definitions) {
    const source = path.join(
      inputDirectory,
      definition.artifactDirectory,
      definition.name,
    );
    await fs.copyFile(source, path.join(outputDirectory, definition.name));
    if (definition.updater) {
      await fs.copyFile(source, path.join(updaterDirectory, definition.name));
    }
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw stagingError(`unexpected argument: ${argument}`);
    }
    const key = argument.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw stagingError(`missing value for --${key.replaceAll("_", "-")}.`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  for (const name of ["input", "output", "updater_output", "version"]) {
    if (!argumentsByName[name]) {
      throw stagingError(`missing required --${name.replaceAll("_", "-")}.`);
    }
  }
  await stageReleaseAssets({
    inputDirectory: path.resolve(argumentsByName.input),
    outputDirectory: path.resolve(argumentsByName.output),
    updaterDirectory: path.resolve(argumentsByName.updater_output),
    version: argumentsByName.version,
  });
  console.log("Validated and staged exact release assets.");
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
