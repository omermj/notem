import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "NoteM";
const REPOSITORY = "omermj/notem";
const DEFAULT_DOWNLOAD_BASE = `https://github.com/${REPOSITORY}/releases/download`;
const NUMERIC_IDENTIFIER = "(?:0|[1-9][0-9]*)";
const NON_NUMERIC_IDENTIFIER = "[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*";
const PRERELEASE_IDENTIFIER = `(?:${NUMERIC_IDENTIFIER}|${NON_NUMERIC_IDENTIFIER})`;
const VERSION_PATTERN = new RegExp(
  `^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
const TAG_PATTERN = /^v(.+)$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function manifestError(message) {
  return new Error(`Updater manifest: ${message}`);
}

function assertVersion(version, label) {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw manifestError(`${label} must be a valid semantic version.`);
  }
}

function assertTagAndVersion(tag, version) {
  const match = typeof tag === "string" ? TAG_PATTERN.exec(tag) : null;
  if (!match) {
    throw manifestError("tag must be a version tag beginning with v.");
  }
  assertVersion(version, "version");
  assertVersion(match[1], "tag version");
  if (match[1] !== version) {
    throw manifestError(
      `tag ${tag} does not match the requested application version ${version}.`,
    );
  }
}

function updaterArtifactDefinitions(version) {
  return [
    {
      platform: "linux-x86_64",
      payload: `${APP_NAME}_${version}_amd64.AppImage`,
      signature: `${APP_NAME}_${version}_amd64.AppImage.sig`,
    },
    {
      platform: "darwin-aarch64",
      payload: `${APP_NAME}_${version}_aarch64.app.tar.gz`,
      signature: `${APP_NAME}_${version}_aarch64.app.tar.gz.sig`,
    },
    {
      platform: "windows-x86_64",
      payload: `${APP_NAME}_${version}_x64-setup.exe`,
      signature: `${APP_NAME}_${version}_x64-setup.exe.sig`,
    },
  ];
}

export function releaseArtifactDefinitions(platform, version) {
  assertVersion(version, "version");
  const updater = updaterArtifactDefinitions(version).find(
    ({ platform: expectedPlatform }) => expectedPlatform === platform,
  );
  if (!updater) {
    throw manifestError(`unsupported release platform ${platform}.`);
  }

  const bundleByPlatform = {
    "linux-x86_64": [
      {
        name: `${APP_NAME}_${version}_amd64.AppImage`,
        source: ["bundle", "appimage", `${APP_NAME}_${version}_amd64.AppImage`],
      },
      {
        name: `${APP_NAME}_${version}_amd64.AppImage.sig`,
        source: [
          "bundle",
          "appimage",
          `${APP_NAME}_${version}_amd64.AppImage.sig`,
        ],
      },
      {
        name: `${APP_NAME}_${version}_amd64.deb`,
        source: ["bundle", "deb", `${APP_NAME}_${version}_amd64.deb`],
      },
    ],
    "darwin-aarch64": [
      {
        name: `${APP_NAME}_${version}_aarch64.dmg`,
        source: ["bundle", "dmg", `${APP_NAME}_${version}_aarch64.dmg`],
      },
      {
        name: `${APP_NAME}_${version}_aarch64.app.tar.gz`,
        source: [
          "bundle",
          "macos",
          `${APP_NAME}_${version}_aarch64.app.tar.gz`,
        ],
      },
      {
        name: `${APP_NAME}_${version}_aarch64.app.tar.gz.sig`,
        source: [
          "bundle",
          "macos",
          `${APP_NAME}_${version}_aarch64.app.tar.gz.sig`,
        ],
      },
    ],
    "windows-x86_64": [
      {
        name: `${APP_NAME}_${version}_x64-setup.exe`,
        source: ["bundle", "nsis", `${APP_NAME}_${version}_x64-setup.exe`],
      },
      {
        name: `${APP_NAME}_${version}_x64-setup.exe.sig`,
        source: ["bundle", "nsis", `${APP_NAME}_${version}_x64-setup.exe.sig`],
      },
    ],
  };

  return bundleByPlatform[platform].map((artifact) => ({
    ...artifact,
    updater:
      artifact.name === updater.payload || artifact.name === updater.signature,
  }));
}

async function walkFiles(directory) {
  const entries = (await fs.readdir(directory, { withFileTypes: true })).sort(
    (left, right) => compareNames(left.name, right.name),
  );
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw manifestError(
        `symbolic link is not an unambiguous artifact: ${entryPath}`,
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw manifestError(`unsupported artifact entry: ${entryPath}`);
    }
  }
  return files;
}

async function collectUpdaterFiles(artifactsDirectory, version) {
  let files;
  try {
    files = await walkFiles(artifactsDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw manifestError(
        `artifact directory does not exist: ${artifactsDirectory}`,
      );
    }
    throw error;
  }

  const expected = updaterArtifactDefinitions(version);
  const expectedNames = new Set(
    expected.flatMap(({ payload, signature }) => [payload, signature]),
  );
  const byName = new Map();
  for (const file of files) {
    const name = path.basename(file);
    if (!expectedNames.has(name)) {
      throw manifestError(`unexpected updater artifact: ${name}`);
    }
    const matches = byName.get(name) ?? [];
    matches.push(file);
    byName.set(name, matches);
  }

  for (const name of expectedNames) {
    const matches = byName.get(name) ?? [];
    if (matches.length === 0) {
      throw manifestError(`missing updater artifact: ${name}`);
    }
    if (matches.length > 1) {
      throw manifestError(`duplicate updater artifact: ${name}`);
    }
    const stats = await fs.stat(matches[0]);
    if (stats.size === 0) {
      throw manifestError(`zero-byte updater artifact: ${name}`);
    }
  }

  return new Map([...byName.entries()].map(([name, [file]]) => [name, file]));
}

function validatePublicationDate(publicationDate) {
  const match =
    typeof publicationDate === "string"
      ? RFC3339_PATTERN.exec(publicationDate)
      : null;
  const parsed =
    typeof publicationDate === "string" ? Date.parse(publicationDate) : NaN;
  const [year, month, day] = match
    ? match[0].slice(0, 10).split("-").map(Number)
    : [];
  const calendarDate = match && new Date(Date.UTC(year, month - 1, day));
  if (
    !match ||
    Number.isNaN(parsed) ||
    !calendarDate ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw manifestError("publication date must be a valid RFC 3339 timestamp.");
  }
}

function downloadUrl(baseUrl, tag, assetName) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw manifestError(`download base URL is invalid: ${baseUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw manifestError("download base URL must use HTTPS.");
  }
  if (/\/latest\/download(?:\/|$)/.test(parsed.pathname)) {
    throw manifestError("binary payload URLs must use an immutable tag path.");
  }
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = `${normalizedBase}/${encodeURIComponent(tag)}/${encodeURIComponent(
    assetName,
  )}`;
  if (/\/latest\/download\//.test(url)) {
    throw manifestError(
      "binary payload URL unexpectedly uses latest/download.",
    );
  }
  return url;
}

async function readSignature(file, name) {
  const contents = await fs.readFile(file);
  if (contents.length === 0) {
    throw manifestError(`zero-byte signature: ${name}`);
  }
  return contents.toString("utf8");
}

export async function generateUpdaterManifest({
  artifactsDirectory,
  outputPath,
  tag,
  version,
  notes,
  publicationDate,
  downloadBaseUrl = DEFAULT_DOWNLOAD_BASE,
}) {
  assertTagAndVersion(tag, version);
  validatePublicationDate(publicationDate);
  if (typeof notes !== "string" || notes.length === 0) {
    throw manifestError("release notes must not be empty.");
  }

  const files = await collectUpdaterFiles(artifactsDirectory, version);
  const platforms = {};
  for (const { platform, payload, signature } of updaterArtifactDefinitions(
    version,
  )) {
    platforms[platform] = {
      url: downloadUrl(downloadBaseUrl, tag, payload),
      signature: await readSignature(files.get(signature), signature),
    };
  }

  const manifest = {
    version,
    notes,
    pub_date: publicationDate,
    platforms,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeAtomically(outputPath, serialized);
  return manifest;
}

async function writeAtomically(outputPath, contents) {
  const directory = path.dirname(outputPath);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, contents, { flag: "wx" });
    await fs.rename(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw manifestError(`unexpected argument: ${argument}`);
    }
    const key = argument.slice(2).replaceAll("-", "_");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw manifestError(`missing value for --${key.replaceAll("_", "-")}.`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const required = [
    "artifacts_directory",
    "output",
    "tag",
    "version",
    "notes_file",
    "publication_date",
  ];
  for (const name of required) {
    if (!argumentsByName[name]) {
      throw manifestError(`missing required --${name.replaceAll("_", "-")}.`);
    }
  }

  const notes = await fs.readFile(argumentsByName.notes_file, "utf8");
  await generateUpdaterManifest({
    artifactsDirectory: path.resolve(argumentsByName.artifacts_directory),
    outputPath: path.resolve(argumentsByName.output),
    tag: argumentsByName.tag,
    version: argumentsByName.version,
    notes,
    publicationDate: argumentsByName.publication_date,
    downloadBaseUrl: argumentsByName.download_base_url ?? DEFAULT_DOWNLOAD_BASE,
  });
  console.log(`Generated ${argumentsByName.output}.`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
