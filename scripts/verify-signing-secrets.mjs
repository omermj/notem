const requiredSecrets = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];

const missingSecrets = requiredSecrets.filter(
  (name) =>
    typeof process.env[name] !== "string" || process.env[name].length === 0,
);

if (missingSecrets.length > 0) {
  throw new Error(
    `Missing required GitHub Actions signing secret(s): ${missingSecrets.join(
      ", ",
    )}. Configure both secrets before running a signed release build.`,
  );
}
