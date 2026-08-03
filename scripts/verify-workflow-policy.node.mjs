import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateRepositoryWorkflowPolicy,
  validateWorkflowPolicy,
} from "./verify-workflow-policy.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("release workflow retains its hardened controls and updater-only scope", async () => {
  await assert.doesNotReject(validateRepositoryWorkflowPolicy(repositoryRoot));
});

test("macOS release build requests the app bundle needed for updater artifacts", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /platform_key: darwin-aarch64\n\s+tauri_args: --target aarch64-apple-darwin --bundles app,dmg /,
  );
  assert.doesNotMatch(
    workflow,
    /platform_key: darwin-aarch64\n\s+tauri_args: --target aarch64-apple-darwin --bundles dmg(?:\s|$)/,
  );
});

test("release workflow passes the manifest script's artifacts directory option", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  assert.match(workflow, /--artifacts-directory updater-artifacts/);
  assert.doesNotMatch(workflow, /--artifacts-dir updater-artifacts/);
});

test("release metadata is committed only after a successful GitHub response", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  assert.match(workflow, /release_fetch_path="release-metadata\.fetch"/);
  assert.match(
    workflow,
    /gh api "repos\/\$REPOSITORY\/releases\/tags\/\$RELEASE_TAG" >"\$release_fetch_path"/,
  );
  assert.match(workflow, /mv "\$release_fetch_path" "\$release_json_path"/);
  assert.match(workflow, /rm -f "\$release_fetch_path" "\$release_json_path"/);
});

async function policyFixture() {
  const read = (file) => readFile(path.join(repositoryRoot, file), "utf8");
  const [
    releaseWorkflow,
    nativeWorkflow,
    ciWorkflow,
    baseConfigContents,
    overlayContents,
  ] = await Promise.all([
    read(".github/workflows/release.yml"),
    read(".github/workflows/native-validation.yml"),
    read(".github/workflows/ci.yml"),
    read("src-tauri/tauri.conf.json"),
    read("src-tauri/tauri.updater.conf.json"),
  ]);
  return {
    releaseWorkflow,
    nativeWorkflow,
    ciWorkflow,
    baseConfigContents,
    overlayContents,
  };
}

test("rejects signing secrets in ordinary native validation", async () => {
  const fixture = await policyFixture();
  fixture.nativeWorkflow += "\n# TAURI_SIGNING_PRIVATE_KEY\n";
  assert.throws(
    () => validateWorkflowPolicy(fixture),
    /must not reference signing secrets/,
  );
});

test("rejects updater artifact creation in the base config", async () => {
  const fixture = await policyFixture();
  const config = JSON.parse(fixture.baseConfigContents);
  config.bundle.createUpdaterArtifacts = true;
  fixture.baseConfigContents = JSON.stringify(config);
  assert.throws(
    () => validateWorkflowPolicy(fixture),
    /base Tauri configuration must keep updater artifact creation disabled/,
  );
});

test("rejects unpinned Actions", async () => {
  const fixture = await policyFixture();
  fixture.ciWorkflow = fixture.ciWorkflow.replace(
    /actions\/checkout@[0-9a-f]{40}/,
    "actions/checkout@main",
  );
  assert.throws(
    () => validateWorkflowPolicy(fixture),
    /not pinned to a full SHA/,
  );
});
