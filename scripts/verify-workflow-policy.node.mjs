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
    /gh api "repos\/\$REPOSITORY\/releases\/\$draft_id" >"\$release_fetch_path"/,
  );
  assert.match(workflow, /mv "\$release_fetch_path" "\$release_json_path"/);
  assert.match(
    workflow,
    /rm -f "\$release_json_path" "\$release_fetch_path" "\$release_error_path"/,
  );
});

test("draft release metadata is resolved by release id, never by tag", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  assert.match(workflow, /releases\?per_page=100/);
  assert.match(workflow, /select\(\.draft == true and \(\.tag_name ==/);
  assert.doesNotMatch(workflow, /releases\/tags\/\$RELEASE_TAG/);
});

test("draft releases are recreated instead of edited in place", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  assert.match(workflow, /resolve_draft_ids\(\) \{/);
  assert.match(workflow, /gh api -X DELETE "repos\/\$REPOSITORY\/releases\/\$stale_id"/);
  assert.match(workflow, /draft_slug="\$\{create_output##\*\/\}"/);
  assert.match(workflow, /gh api "repos\/\$REPOSITORY\/releases\/tags\/\$draft_slug"/);
  assert.doesNotMatch(workflow, /--method PATCH "repos\/\$REPOSITORY\/releases\/\$draft_id"/);
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

test("release asset verification retries GitHub release metadata propagation", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );
  assert.match(workflow, /fetch_release_json\(\) \{/);
  assert.match(workflow, /for attempt in \{1\.\.10\}; do/);
  assert.match(workflow, /sleep 2/);
  assert.match(workflow, /fetch_release_json uploaded-release\.json/);
  assert.doesNotMatch(
    workflow,
    /gh api "repos\/\$REPOSITORY\/releases\/tags\/\$RELEASE_TAG" >uploaded-release\.json/,
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
