import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { collectReleaseArtifacts } from "./collect-release-artifacts.mjs";
import { releaseArtifactDefinitions } from "./generate-updater-manifest.mjs";

const VERSION = "0.2.3";

async function createFixture(platform) {
  const sourceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "notem-release-collector-"),
  );
  const definitions = releaseArtifactDefinitions(platform, VERSION);
  for (const definition of definitions) {
    const source = path.join(sourceRoot, ...definition.source);
    await fs.mkdir(path.dirname(source), { recursive: true });
    await fs.writeFile(source, `contents for ${definition.name}`);
  }
  return { sourceRoot, definitions };
}

async function withFixture(platform, callback) {
  const fixture = await createFixture(platform);
  try {
    return await callback(fixture);
  } finally {
    await fs.rm(fixture.sourceRoot, { recursive: true, force: true });
  }
}

async function collect(platform, sourceRoot) {
  const outputDirectory = path.join(sourceRoot, "release-artifacts");
  await collectReleaseArtifacts({
    platform,
    version: VERSION,
    sourceRoot,
    outputDirectory,
  });
  return outputDirectory;
}

test("tolerates Linux DEB staging directories and copies exact artifacts only", async () => {
  await withFixture("linux-x86_64", async ({ sourceRoot, definitions }) => {
    const stagingDirectory = path.join(
      sourceRoot,
      "bundle",
      "deb",
      `NoteM_${VERSION}_amd64`,
    );
    await fs.mkdir(path.join(stagingDirectory, "usr", "share"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(stagingDirectory, "usr", "share", "staged-file"),
      "staging contents",
    );

    const outputDirectory = await collect("linux-x86_64", sourceRoot);
    const outputNames = await fs.readdir(outputDirectory);
    assert.deepEqual(
      outputNames.sort(),
      definitions.map(({ name }) => name).sort(),
    );
    assert.equal(
      await fs
        .access(path.join(outputDirectory, `NoteM_${VERSION}_amd64`))
        .then(() => true)
        .catch(() => false),
      false,
    );
    assert.equal(
      await fs
        .access(path.join(outputDirectory, "usr", "share", "staged-file"))
        .then(() => true)
        .catch(() => false),
      false,
    );
  });
});

test("collects exact macOS and Windows artifacts", async () => {
  for (const platform of ["darwin-aarch64", "windows-x86_64"]) {
    await withFixture(platform, async ({ sourceRoot, definitions }) => {
      const outputDirectory = await collect(platform, sourceRoot);
      assert.deepEqual(
        (await fs.readdir(outputDirectory)).sort(),
        definitions.map(({ name }) => name).sort(),
      );
    });
  }
});

test("rejects unexpected recognized release artifacts", async () => {
  const cases = [
    {
      platform: "linux-x86_64",
      directory: ["bundle", "deb"],
      name: `NoteM_${VERSION}_extra.deb`,
    },
    {
      platform: "linux-x86_64",
      directory: ["bundle", "appimage"],
      name: `NoteM_${VERSION}_extra.AppImage`,
    },
    {
      platform: "darwin-aarch64",
      directory: ["bundle", "dmg"],
      name: `NoteM_${VERSION}_extra.dmg`,
    },
    {
      platform: "darwin-aarch64",
      directory: ["bundle", "macos"],
      name: `NoteM_${VERSION}_extra.app.tar.gz`,
    },
    {
      platform: "windows-x86_64",
      directory: ["bundle", "nsis"],
      name: `NoteM_${VERSION}_extra.exe`,
    },
  ];

  for (const { platform, directory, name } of cases) {
    await withFixture(platform, async ({ sourceRoot }) => {
      await fs.writeFile(path.join(sourceRoot, ...directory, name), "extra");
      await assert.rejects(
        collect(platform, sourceRoot),
        new RegExp(`unexpected or duplicate artifact: ${name}`),
      );
    });
  }
});

test("rejects a duplicate recognized artifact in another bundle directory", async () => {
  await withFixture("linux-x86_64", async ({ sourceRoot }) => {
    const duplicateName = `NoteM_${VERSION}_amd64.AppImage`;
    await fs.writeFile(
      path.join(sourceRoot, "bundle", "deb", duplicateName),
      "duplicate",
    );
    await assert.rejects(
      collect("linux-x86_64", sourceRoot),
      new RegExp(`unexpected or duplicate artifact: ${duplicateName}`),
    );
  });
});

test("rejects a symbolic link posing as an artifact", async () => {
  await withFixture("linux-x86_64", async ({ sourceRoot }) => {
    const artifact = path.join(
      sourceRoot,
      "bundle",
      "deb",
      `NoteM_${VERSION}_amd64.deb`,
    );
    const target = path.join(sourceRoot, "real-artifact.deb");
    await fs.writeFile(target, "real artifact");
    await fs.rm(artifact);
    await fs.symlink(target, artifact);

    await assert.rejects(
      collect("linux-x86_64", sourceRoot),
      /ambiguous artifact entry/,
    );
  });
});

test("rejects zero-byte expected artifacts", async () => {
  await withFixture("linux-x86_64", async ({ sourceRoot }) => {
    await fs.writeFile(
      path.join(
        sourceRoot,
        "bundle",
        "appimage",
        `NoteM_${VERSION}_amd64.AppImage`,
      ),
      "",
    );
    await assert.rejects(
      collect("linux-x86_64", sourceRoot),
      /zero-byte artifact: NoteM_0\.2\.3_amd64\.AppImage/,
    );
  });
});
