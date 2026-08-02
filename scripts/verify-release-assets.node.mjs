import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { verifyReleaseAssets } from "./verify-release-assets.mjs";

async function fixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "notem-release-assets-"),
  );
  await fs.writeFile(path.join(directory, "NoteM.AppImage"), "appimage");
  await fs.writeFile(path.join(directory, "latest.json"), "manifest");
  return directory;
}

const asset = (name, size = 1) => ({ name, size });

test("accepts an exact non-empty draft asset set", async () => {
  const directory = await fixture();
  try {
    await assert.doesNotReject(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: {
          draft: true,
          assets: [asset("latest.json"), asset("NoteM.AppImage")],
        },
      }),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("allows only expected assets during draft preflight", async () => {
  const directory = await fixture();
  try {
    await assert.doesNotReject(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: { draft: true, assets: [asset("latest.json")] },
        allowMissing: true,
      }),
    );
    await assert.rejects(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: { draft: true, assets: [asset("stale.zip")] },
        allowMissing: true,
      }),
      /unexpected release asset: stale\.zip/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("rejects missing, duplicate, empty, or published assets", async () => {
  const directory = await fixture();
  try {
    await assert.rejects(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: { draft: true, assets: [asset("latest.json")] },
      }),
      /missing release asset/,
    );
    await assert.rejects(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: {
          draft: true,
          assets: [asset("latest.json"), asset("latest.json")],
        },
      }),
      /duplicate release asset/,
    );
    await assert.rejects(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: { draft: true, assets: [asset("latest.json", 0)] },
        allowMissing: true,
      }),
      /invalid or empty release asset/,
    );
    await assert.rejects(
      verifyReleaseAssets({
        expectedDirectory: directory,
        release: { draft: false, assets: [] },
        allowMissing: true,
      }),
      /not a draft release/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
