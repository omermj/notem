import { spawn } from "node:child_process";
import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED_LIBRARY_PATTERN = /^libwayland-client\.so\.0(?:\..+)?$/;
const EXTRACTION_DIRECTORY = "squashfs-root";

function verificationError(message) {
  return new Error(`Linux AppImage verification: ${message}`);
}

export function findBundledWaylandClientLibraries(root) {
  return walk(root, "");
}

async function walk(directory, relativeToRoot) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw verificationError(`directory does not exist: ${directory}`);
    }
    throw error;
  }
  entries.sort((left, right) => (left.name < right.name ? -1 : 1));
  const matches = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const relativePath = relativeToRoot
      ? `${relativeToRoot}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      matches.push(...(await walk(entryPath, relativePath)));
      continue;
    }
    if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      BUNDLED_LIBRARY_PATTERN.test(entry.name)
    ) {
      matches.push(relativePath);
    }
  }
  return matches;
}

export async function extractAppImage(appImagePath, destination) {
  const stats = await fs.lstat(appImagePath).catch((error) => {
    if (error?.code === "ENOENT") {
      throw verificationError(`AppImage not found: ${appImagePath}`);
    }
    throw error;
  });
  if (!stats.isFile()) {
    throw verificationError(`AppImage is not a regular file: ${appImagePath}`);
  }
  try {
    await fs.access(appImagePath, constants.X_OK);
  } catch {
    throw verificationError(`AppImage is not executable: ${appImagePath}`);
  }

  const result = await new Promise((resolve) => {
    const child = spawn(appImagePath, ["--appimage-extract"], {
      cwd: destination,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ code: -1, stderr: String(error) }));
    child.on("close", (code) => resolve({ code, stderr }));
  });
  if (result.code !== 0) {
    throw verificationError(
      `could not extract the AppImage (exit ${result.code}): ${result.stderr.trim()}`,
    );
  }
  const extractedDirectory = path.join(destination, EXTRACTION_DIRECTORY);
  try {
    await fs.access(extractedDirectory);
  } catch {
    throw verificationError(
      "AppImage extraction did not produce a squashfs-root directory.",
    );
  }
  return extractedDirectory;
}

export async function assertNoBundledWaylandClient(appImagePath) {
  const workdir = await fs.mkdtemp(
    path.join(os.tmpdir(), "notem-appimage-verify-"),
  );
  try {
    const extractedDirectory = await extractAppImage(appImagePath, workdir);
    const bundled = await findBundledWaylandClientLibraries(extractedDirectory);
    if (bundled.length > 0) {
      throw verificationError(
        `ERROR: Linux AppImage bundles libwayland-client.so.0: ${bundled.join(", ")}`,
      );
    }
    return bundled;
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

function main() {
  const appImagePath = process.argv[2];
  if (!appImagePath || process.argv.length !== 3) {
    console.error(
      "Usage: node scripts/verify-linux-appimage.mjs <path/to/AppImage>",
    );
    process.exitCode = 1;
    return;
  }
  assertNoBundledWaylandClient(path.resolve(appImagePath))
    .then(() => {
      console.log(
        `Verified ${path.basename(appImagePath)} does not bundle libwayland-client.so.0.`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main();
}
