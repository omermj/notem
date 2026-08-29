import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FULL_SHA_ACTION_PATTERN = /^[0-9a-f]{40}$/;
const UPDATER_OVERLAY = "src-tauri/tauri.updater.conf.json";
const SIGNING_SECRET_NAMES = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
const SIGNING_SECRET_STEPS = [
  "Build platform bundle",
  "Re-sign Linux AppImage",
];

function policyError(message) {
  return new Error(`Workflow policy: ${message}`);
}

function workflowLines(contents) {
  return contents.split(/\r?\n/);
}

function jobNameForLine(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const match = /^[ ]{2}([A-Za-z0-9_-]+):\s*$/.exec(lines[index]);
    if (match && match[1] !== "jobs") {
      return match[1];
    }
  }
  return null;
}

function assertPinnedActions(workflowPath, contents) {
  for (const [lineIndex, line] of workflowLines(contents).entries()) {
    const match = /^\s*uses:\s*[^\s#]+@([^\s#]+)(?:\s+#.*)?\s*$/.exec(line);
    if (!match) {
      if (/^\s*uses:\s*\S+/.test(line)) {
        throw policyError(
          `${workflowPath}:${lineIndex + 1} uses an Action without a full commit SHA.`,
        );
      }
      continue;
    }
    if (!FULL_SHA_ACTION_PATTERN.test(match[1])) {
      throw policyError(
        `${workflowPath}:${lineIndex + 1} Action reference is not pinned to a full SHA.`,
      );
    }
  }
}

function assertCheckoutCredentials(workflowPath, contents) {
  const lines = workflowLines(contents);
  const checkoutLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes("uses: actions/checkout@"));
  const disabledCredentialLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /persist-credentials:\s*false/.test(line));
  if (checkoutLines.length !== disabledCredentialLines.length) {
    throw policyError(
      `${workflowPath} must disable checkout credentials for every checkout.`,
    );
  }
  if (lines.some((line) => /persist-credentials:\s*true/.test(line))) {
    throw policyError(
      `${workflowPath} must not enable persisted checkout credentials.`,
    );
  }
}

function assertSingleWriteJob(workflows) {
  const writeLocations = [];
  for (const [workflowPath, contents] of workflows) {
    for (const [lineIndex, line] of workflowLines(contents).entries()) {
      if (/^\s*contents:\s*write\s*(?:#.*)?$/.test(line)) {
        writeLocations.push({
          workflowPath,
          job: jobNameForLine(workflowLines(contents), lineIndex),
        });
      }
    }
  }
  if (
    writeLocations.length !== 1 ||
    writeLocations[0].workflowPath !== ".github/workflows/release.yml" ||
    writeLocations[0].job !== "publish-draft"
  ) {
    throw policyError(
      `only .github/workflows/release.yml job publish-draft may have contents: write (found ${writeLocations
        .map(({ workflowPath, job }) => `${workflowPath}:${job}`)
        .join(", ")}).`,
    );
  }
}

function assertSigningSecretScope(releaseWorkflow, nativeWorkflow, ciWorkflow) {
  const releaseLines = workflowLines(releaseWorkflow);
  const orderedSecretNames = [...SIGNING_SECRET_NAMES].sort(
    (left, right) => right.length - left.length,
  );
  const secretSteps = new Map();
  for (const [lineIndex, line] of releaseLines.entries()) {
    const secretName = orderedSecretNames.find((name) =>
      line.includes(`secrets.${name}`),
    );
    if (secretName === undefined) {
      continue;
    }
    let stepName = null;
    for (let index = lineIndex; index >= 0; index -= 1) {
      const step = /^[ ]{6}- name: (.+)$/.exec(releaseLines[index]);
      if (step) {
        stepName = step[1];
        break;
      }
    }
    if (stepName === null) {
      throw policyError(
        `signing secret ${secretName} must be scoped to a named workflow step.`,
      );
    }
    const secretStepsForStep = secretSteps.get(stepName) ?? [];
    secretStepsForStep.push(secretName);
    secretSteps.set(stepName, secretStepsForStep);
  }
  for (const stepName of secretSteps.keys()) {
    if (!SIGNING_SECRET_STEPS.includes(stepName)) {
      throw policyError(
        `signing secrets must be scoped only to these steps: ${SIGNING_SECRET_STEPS.join(", ")} (found ${stepName}).`,
      );
    }
    const secretStepsForStep = secretSteps.get(stepName);
    for (const name of SIGNING_SECRET_NAMES) {
      if (
        secretStepsForStep.filter((secretName) => secretName === name)
          .length !== 1
      ) {
        throw policyError(
          `release workflow must reference each signing secret exactly once per signing step; step ${stepName} does not.`,
        );
      }
    }
  }
  if (secretSteps.size !== SIGNING_SECRET_STEPS.length) {
    throw policyError(
      `release workflow must scope signing secrets to exactly these steps: ${SIGNING_SECRET_STEPS.join(", ")} (found ${[...secretSteps.keys()].join(", ") || "none"}).`,
    );
  }
  if (
    SIGNING_SECRET_NAMES.some(
      (name) => nativeWorkflow.includes(name) || ciWorkflow.includes(name),
    )
  ) {
    throw policyError(
      "native validation and pull-request CI must not reference signing secrets.",
    );
  }
}

function assertUpdaterOverlay(
  releaseWorkflow,
  nativeWorkflow,
  baseConfigContents,
  overlayContents,
) {
  let baseConfig;
  try {
    baseConfig = JSON.parse(baseConfigContents);
  } catch {
    throw policyError("src-tauri/tauri.conf.json is not valid JSON.");
  }
  if (baseConfig?.bundle?.createUpdaterArtifacts !== false) {
    throw policyError(
      "the base Tauri configuration must keep updater artifact creation disabled.",
    );
  }
  let overlay;
  try {
    overlay = JSON.parse(overlayContents);
  } catch {
    throw policyError(`${UPDATER_OVERLAY} is not valid JSON.`);
  }
  if (
    JSON.stringify(overlay) !==
    JSON.stringify({ bundle: { createUpdaterArtifacts: true } })
  ) {
    throw policyError(
      `${UPDATER_OVERLAY} must remain a minimal updater-only overlay.`,
    );
  }
  if (!releaseWorkflow.includes(`--config ${UPDATER_OVERLAY}`)) {
    throw policyError(
      "release workflow must pass the updater configuration overlay to Tauri build.",
    );
  }
  if (nativeWorkflow.includes(`--config ${UPDATER_OVERLAY}`)) {
    throw policyError(
      "native validation must build with the base Tauri configuration.",
    );
  }
}

function assertReleaseControls(releaseWorkflow) {
  const requiredFragments = [
    "Release tag must be an exact semantic version",
    "Release tag must be annotated",
    "ref: ${{ needs.validate.outputs.commit_sha }}",
    "persist-credentials: false",
    "EXPECTED_TAG_OBJECT_SHA",
    "--verify-tag",
    "--draft",
    "environment: release",
    "contents: read",
    "pnpm tauri build",
    "scripts/fix-linux-appimage.sh",
    "pnpm tauri signer sign",
    "scripts/verify-linux-appimage.mjs",
    "scripts/generate-updater-manifest.mjs",
    "scripts/generate-sha256sums.mjs",
    "scripts/verify-release-assets.mjs",
  ];
  for (const fragment of requiredFragments) {
    if (!releaseWorkflow.includes(fragment)) {
      throw policyError(
        `release workflow is missing required control: ${fragment}`,
      );
    }
  }
  if (releaseWorkflow.includes("tauri-apps/tauri-action@")) {
    throw policyError(
      "release workflow must not use the generic tauri-action publishing flow.",
    );
  }
  if (releaseWorkflow.includes("--draft=false")) {
    throw policyError(
      "release workflow must never publish a release automatically.",
    );
  }
}

export function validateWorkflowPolicy({
  releaseWorkflow,
  nativeWorkflow,
  ciWorkflow,
  baseConfigContents,
  overlayContents,
}) {
  const workflows = new Map([
    [".github/workflows/release.yml", releaseWorkflow],
    [".github/workflows/native-validation.yml", nativeWorkflow],
    [".github/workflows/ci.yml", ciWorkflow],
  ]);
  for (const [workflowPath, contents] of workflows) {
    assertPinnedActions(workflowPath, contents);
    assertCheckoutCredentials(workflowPath, contents);
  }
  assertSingleWriteJob(workflows);
  assertSigningSecretScope(releaseWorkflow, nativeWorkflow, ciWorkflow);
  assertUpdaterOverlay(
    releaseWorkflow,
    nativeWorkflow,
    baseConfigContents,
    overlayContents,
  );
  assertReleaseControls(releaseWorkflow);
}

async function readRepositoryFiles(repositoryRoot) {
  const workflowRoot = path.join(repositoryRoot, ".github", "workflows");
  const [
    releaseWorkflow,
    nativeWorkflow,
    ciWorkflow,
    baseConfigContents,
    overlayContents,
  ] = await Promise.all([
    fs.readFile(path.join(workflowRoot, "release.yml"), "utf8"),
    fs.readFile(path.join(workflowRoot, "native-validation.yml"), "utf8"),
    fs.readFile(path.join(workflowRoot, "ci.yml"), "utf8"),
    fs.readFile(
      path.join(repositoryRoot, "src-tauri", "tauri.conf.json"),
      "utf8",
    ),
    fs.readFile(
      path.join(repositoryRoot, "src-tauri", "tauri.updater.conf.json"),
      "utf8",
    ),
  ]);
  return {
    releaseWorkflow,
    nativeWorkflow,
    ciWorkflow,
    baseConfigContents,
    overlayContents,
  };
}

export async function validateRepositoryWorkflowPolicy(repositoryRoot) {
  validateWorkflowPolicy(await readRepositoryFiles(repositoryRoot));
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  validateRepositoryWorkflowPolicy(path.resolve(process.argv[2] ?? "."))
    .then(() => console.log("Workflow policy checks passed."))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
