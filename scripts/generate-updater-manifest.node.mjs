import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  generateUpdaterManifest,
  releaseArtifactDefinitions,
} from "./generate-updater-manifest.mjs";

const VERSION = "1.2.3+build";
const TAG = `v${VERSION}`;
const PUBLICATION_DATE = "2026-08-02T12:00:00Z";

async function createFixture({
  omit = [],
  extra = [],
  duplicate = false,
} = {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "notem-updater-manifest-"),
  );
  const definitions = releaseArtifactDefinitions("linux-x86_64", VERSION)
    .concat(releaseArtifactDefinitions("darwin-aarch64", VERSION))
    .concat(releaseArtifactDefinitions("windows-x86_64", VERSION))
    .filter(({ updater }) => updater);

  for (const definition of definitions) {
    if (omit.includes(definition.name)) continue;
    const contents = definition.name.endsWith(".sig")
      ? `signature for ${definition.name}\n`
      : `payload for ${definition.name}`;
    await fs.writeFile(path.join(directory, definition.name), contents);
  }
  for (const extraName of extra) {
    await fs.writeFile(path.join(directory, extraName), "unexpected");
  }
  if (duplicate) {
    const duplicateDirectory = path.join(directory, "duplicate");
    await fs.mkdir(duplicateDirectory);
    await fs.copyFile(
      path.join(directory, definitions[0].name),
      path.join(duplicateDirectory, definitions[0].name),
    );
  }
  return directory;
}

async function withFixture(options, callback) {
  const directory = await createFixture(options);
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function manifestOptions(artifactsDirectory, outputPath, overrides = {}) {
  return {
    artifactsDirectory,
    outputPath,
    tag: TAG,
    version: VERSION,
    notes: 'Release "quotes"\nUnicode: café — 🚀',
    publicationDate: PUBLICATION_DATE,
    ...overrides,
  };
}

test("generates a valid deterministic three-platform manifest", async () => {
  await withFixture({}, async (artifactsDirectory) => {
    const outputDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "notem-updater-output-"),
    );
    try {
      const firstOutput = path.join(outputDirectory, "latest-first.json");
      const secondOutput = path.join(outputDirectory, "latest-second.json");
      const options = manifestOptions(artifactsDirectory, firstOutput);
      const first = await generateUpdaterManifest(options);
      await generateUpdaterManifest({ ...options, outputPath: secondOutput });

      assert.deepEqual(Object.keys(first), [
        "version",
        "notes",
        "pub_date",
        "platforms",
      ]);
      assert.deepEqual(Object.keys(first.platforms), [
        "linux-x86_64",
        "darwin-aarch64",
        "windows-x86_64",
      ]);
      assert.equal(
        first.platforms["linux-x86_64"].url,
        "https://github.com/omermj/notem/releases/download/v1.2.3%2Bbuild/NoteM_1.2.3%2Bbuild_amd64.AppImage",
      );
      assert.equal(
        first.platforms["darwin-aarch64"].signature,
        `signature for NoteM_${VERSION}_aarch64.app.tar.gz.sig\n`,
      );
      assert.equal(first.notes, 'Release "quotes"\nUnicode: café — 🚀');

      const firstContents = await fs.readFile(firstOutput, "utf8");
      const secondContents = await fs.readFile(secondOutput, "utf8");
      assert.equal(firstContents, secondContents);
      assert.match(firstContents, /\n$/);
      assert.equal(JSON.parse(firstContents).notes, first.notes);
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });
});

test("rejects a missing signature", async () => {
  await withFixture(
    { omit: [`NoteM_${VERSION}_amd64.AppImage.sig`] },
    async (artifactsDirectory) => {
      await assert.rejects(
        generateUpdaterManifest(
          manifestOptions(
            artifactsDirectory,
            path.join(artifactsDirectory, "latest.json"),
          ),
        ),
        /missing updater artifact: NoteM_1\.2\.3\+build_amd64\.AppImage\.sig/,
      );
    },
  );
});

test("rejects duplicate artifacts", async () => {
  await withFixture({ duplicate: true }, async (artifactsDirectory) => {
    await assert.rejects(
      generateUpdaterManifest(
        manifestOptions(
          artifactsDirectory,
          path.join(artifactsDirectory, "latest.json"),
        ),
      ),
      /duplicate updater artifact: NoteM_1\.2\.3\+build_amd64\.AppImage/,
    );
  });
});

test("rejects an empty signature", async () => {
  await withFixture({}, async (artifactsDirectory) => {
    await fs.writeFile(
      path.join(artifactsDirectory, `NoteM_${VERSION}_amd64.AppImage.sig`),
      "",
    );
    await assert.rejects(
      generateUpdaterManifest(
        manifestOptions(
          artifactsDirectory,
          path.join(artifactsDirectory, "latest.json"),
        ),
      ),
      /zero-byte updater artifact: NoteM_1\.2\.3\+build_amd64\.AppImage\.sig/,
    );
  });
});

test("rejects a wrong platform artifact", async () => {
  await withFixture(
    { omit: [`NoteM_${VERSION}_amd64.AppImage`] },
    async (artifactsDirectory) => {
      await fs.writeFile(
        path.join(artifactsDirectory, `NoteM_${VERSION}_x86_64.AppImage`),
        "wrong platform",
      );
      await assert.rejects(
        generateUpdaterManifest(
          manifestOptions(
            artifactsDirectory,
            path.join(artifactsDirectory, "latest.json"),
          ),
        ),
        /unexpected updater artifact: NoteM_1\.2\.3\+build_x86_64\.AppImage/,
      );
    },
  );
});

test("rejects malformed versions and tag/version mismatches", async () => {
  await withFixture({}, async (artifactsDirectory) => {
    const outputPath = path.join(artifactsDirectory, "latest.json");
    await assert.rejects(
      generateUpdaterManifest(
        manifestOptions(artifactsDirectory, outputPath, {
          tag: "v1.2.3-01",
          version: "1.2.3-01",
        }),
      ),
      /version must be a valid semantic version/,
    );
    await assert.rejects(
      generateUpdaterManifest(
        manifestOptions(artifactsDirectory, outputPath, {
          tag: "v1.2.4",
        }),
      ),
      /tag v1\.2\.4 does not match/,
    );
  });
});

test("rejects unsupported extra updater artifacts", async () => {
  await withFixture(
    { extra: [`NoteM_${VERSION}_arm64.AppImage`] },
    async (artifactsDirectory) => {
      await assert.rejects(
        generateUpdaterManifest(
          manifestOptions(
            artifactsDirectory,
            path.join(artifactsDirectory, "latest.json"),
          ),
        ),
        /unexpected updater artifact: NoteM_1\.2\.3\+build_arm64\.AppImage/,
      );
    },
  );
});

test("rejects accidental latest/download binary URLs", async () => {
  await withFixture({}, async (artifactsDirectory) => {
    await assert.rejects(
      generateUpdaterManifest(
        manifestOptions(
          artifactsDirectory,
          path.join(artifactsDirectory, "latest.json"),
          {
            downloadBaseUrl:
              "https://github.com/omermj/notem/releases/latest/download",
          },
        ),
      ),
      /immutable tag path/,
    );
  });
});
