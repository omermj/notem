import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateRepositoryWorkflowPolicy } from "./verify-workflow-policy.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("release workflow retains its hardened controls and updater-only scope", async () => {
  await assert.doesNotReject(validateRepositoryWorkflowPolicy(repositoryRoot));
});
