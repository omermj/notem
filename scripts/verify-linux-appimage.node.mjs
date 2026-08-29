import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoBundledWaylandClient,
  findBundledWaylandClientLibraries,
} from "./verify-linux-appimage.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readRepositoryFile(...segments) {
  return fs.readFile(path.join(repositoryRoot, ...segments), "utf8");
}

async function createLibraryTree(entries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "notem-appimage-scan-"));
  for (const [relativePath, type] of Object.entries(entries)) {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (type === "symlink") {
      await fs.symlink("libwayland-client.so.0.2000.0", target);
    } else {
      await fs.writeFile(target, "elf payload");
    }
  }
  return root;
}

test("detects every bundled libwayland-client.so.0* file and symlink", async () => {
  const root = await createLibraryTree({
    "usr/lib/libwayland-client.so.0": "symlink",
    "usr/lib/libwayland-client.so.0.2000.0": "file",
    "usr/lib/debug/usr/lib/libwayland-client.so.0.2000.0.debug": "file",
  });
  try {
    assert.deepEqual((await findBundledWaylandClientLibraries(root)).sort(), [
      "usr/lib/debug/usr/lib/libwayland-client.so.0.2000.0.debug",
      "usr/lib/libwayland-client.so.0",
      "usr/lib/libwayland-client.so.0.2000.0",
    ]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("does not flag unrelated or unversioned wayland libraries", async () => {
  const root = await createLibraryTree({
    "usr/lib/libwayland-cursor.so.0": "file",
    "usr/lib/libwayland-egl.so.1": "file",
    "usr/lib/libwayland-server.so.0": "file",
    "usr/lib/libwayland-client.so": "symlink",
    "usr/lib/libEGL.so.1": "file",
    "usr/lib/libwayland-client": "file",
  });
  try {
    assert.deepEqual(await findBundledWaylandClientLibraries(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("verifier rejects a missing AppImage without attempting extraction", async () => {
  const missingPath = path.join(
    os.tmpdir(),
    `notem-missing-${Date.now()}.AppImage`,
  );
  await assert.rejects(
    assertNoBundledWaylandClient(missingPath),
    new RegExp(
      `AppImage not found: ${missingPath.replaceAll(".", "\\.")}`.replaceAll(
        "/",
        "\\/",
      ),
    ),
  );
});

test("verifier rejects a directory posing as an AppImage", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "notem-not-an-appimage-"),
  );
  try {
    await assert.rejects(
      assertNoBundledWaylandClient(directory),
      /AppImage is not a regular file/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("verifier rejects a non-executable AppImage", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notem-noexec-"));
  const appImage = path.join(directory, "NoteM_0.0.0_amd64.AppImage");
  try {
    await fs.writeFile(appImage, "not executable");
    await assert.rejects(
      assertNoBundledWaylandClient(appImage),
      /AppImage is not executable/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("fix script fails loudly for a missing AppImage", async () => {
  const script = path.join(repositoryRoot, "scripts", "fix-linux-appimage.sh");
  await assert.rejects(
    execFileAsync("bash", [script, "/nonexistent/NoteM_0.0.0_amd64.AppImage"]),
    (error) => {
      assert.match(error.stderr, /ERROR: AppImage not found/);
      assert.equal(error.code, 1);
      return true;
    },
  );
});

test("fix script is fail-fast, cleans up, and verifies removal", async () => {
  const script = await readRepositoryFile("scripts", "fix-linux-appimage.sh");
  assert.match(script, /^set -euo pipefail$/m);
  assert.match(script, /trap 'rm -rf -- "\$workdir"' EXIT INT TERM/);
  assert.match(script, /--appimage-extract/);
  assert.match(script, /libwayland-client\.so\.0/);
  assert.match(
    script,
    /bundled \$\{BUNDLED_LIBRARY_NAME\}\* still present after removal/,
  );
  assert.match(script, /rm -f -- "\$signature"/);
});

test("fix script pins both upstream release artifacts with SHA-256 checksums", async () => {
  const script = await readRepositoryFile("scripts", "fix-linux-appimage.sh");
  const pins = [
    ...script.matchAll(/^(APPIMAGETOOL|RUNTIME)_SHA256="([0-9a-f]{64})"$/gm),
  ].map(([, tool, sha256]) => ({ tool, sha256 }));
  assert.deepEqual(
    pins.map(({ tool }) => tool),
    ["APPIMAGETOOL", "RUNTIME"],
  );
  assert.match(script, /checksum mismatch for/);
  assert.doesNotMatch(script, /releases\/download\/continuous\//);
  assert.match(script, /--runtime-file "\$runtime_file"/);
});

test("release workflow fixes, re-signs, and verifies the AppImage before collection", async () => {
  const workflow = await readRepositoryFile(
    ".github",
    "workflows",
    "release.yml",
  );
  const stepOrder = [
    "Build platform bundle",
    "Fix Linux AppImage",
    "Re-sign Linux AppImage",
    "Verify fixed Linux AppImage",
    "Verify bundled legal documents",
    "Collect exact platform release artifacts",
  ];
  const positions = stepOrder.map((step) =>
    workflow.indexOf(`- name: ${step}\n`),
  );
  assert.ok(
    positions.every((position) => position !== -1),
    "release workflow is missing an expected step",
  );
  assert.deepEqual(
    [...positions].sort((left, right) => left - right),
    positions,
    "release workflow steps are out of order",
  );
  for (const step of [
    "Fix Linux AppImage",
    "Re-sign Linux AppImage",
    "Verify fixed Linux AppImage",
  ]) {
    const stepPattern = new RegExp(
      `- name: ${step}\\n\\s+if: runner\\.os == 'Linux'`,
    );
    assert.match(workflow, stepPattern);
  }
  assert.match(workflow, /pnpm tauri signer sign "\$appimage_path"/);
  assert.match(workflow, /test -s "\$signature_path"/);
  assert.match(
    workflow,
    /node scripts\/verify-linux-appimage\.mjs "\$appimage_path"/,
  );
});

test("native validation exercises the AppImage fix and verification", async () => {
  const workflow = await readRepositoryFile(
    ".github",
    "workflows",
    "native-validation.yml",
  );
  assert.match(
    workflow,
    /bash scripts\/fix-linux-appimage\.sh "\$appimage_path"/,
  );
  assert.match(
    workflow,
    /node scripts\/verify-linux-appimage\.mjs "\$appimage_path"/,
  );
  const fixStep = workflow.indexOf("- name: Fix and verify Linux AppImage");
  const verifyStep = workflow.indexOf("node scripts/verify-linux-appimage.mjs");
  assert.notEqual(fixStep, -1);
  assert.ok(verifyStep > fixStep);
});

test("no runtime environment-variable workarounds are introduced", async () => {
  const files = [
    ".github/workflows/release.yml",
    ".github/workflows/native-validation.yml",
    "scripts/fix-linux-appimage.sh",
    "scripts/verify-linux-appimage.mjs",
  ];
  for (const file of files) {
    const contents = await readRepositoryFile(...file.split("/"));
    for (const forbidden of [
      "LD_PRELOAD",
      "WEBKIT_DISABLE_DMABUF_RENDERER",
      "GDK_BACKEND",
    ]) {
      assert.equal(
        contents.includes(forbidden),
        false,
        `${file} unexpectedly references ${forbidden}`,
      );
    }
  }
});

test("release test suite covers the AppImage verification tests", async () => {
  const packageJson = JSON.parse(await readRepositoryFile("package.json"));
  assert.match(
    packageJson.scripts["test:release"],
    /scripts\/verify-linux-appimage\.node\.mjs/,
  );
});
