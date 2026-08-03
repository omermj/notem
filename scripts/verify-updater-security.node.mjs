import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const json = async (relativePath) =>
  JSON.parse(
    await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"),
  );

test("updater endpoint and public key are fixed and internally consistent", async () => {
  const config = await json("src-tauri/tauri.conf.json");
  const updater = config.plugins?.updater;
  assert.deepEqual(updater?.endpoints, [
    "https://github.com/omermj/notem/releases/latest/download/latest.json",
  ]);
  assert.equal(updater?.windows?.installMode, "passive");
  assert.equal(config.bundle?.createUpdaterArtifacts, false);
  assert.equal("dangerousAcceptInvalidCerts" in updater, false);
  assert.equal("dangerousAcceptInvalidHostnames" in updater, false);

  const decoded = Buffer.from(updater.pubkey, "base64").toString("utf8");
  const lines = decoded.trimEnd().split("\n");
  assert.deepEqual(lines.slice(0, 1), [
    "untrusted comment: minisign public key: A0031CE2348209E7",
  ]);
  const key = Buffer.from(lines[1], "base64");
  assert.equal(key.length, 42);
  assert.equal(key.subarray(0, 2).toString("ascii"), "Ed");
  assert.equal(
    Buffer.from(key.subarray(2, 10)).reverse().toString("hex").toUpperCase(),
    "A0031CE2348209E7",
  );
});

test("updater and restart permissions exist only on the main window", async () => {
  const main = await json("src-tauri/capabilities/default.json");
  const detached = await json("src-tauri/capabilities/detached-note.json");
  assert.deepEqual(main.windows, ["main"]);
  assert.equal(main.permissions.includes("updater:default"), true);
  assert.equal(main.permissions.includes("process:allow-restart"), true);
  assert.deepEqual(detached.windows, ["note-*"]);
  assert.equal(detached.permissions.includes("updater:default"), false);
  assert.equal(detached.permissions.includes("process:allow-restart"), false);
});

test("only the release overlay enables updater artifact creation", async () => {
  const overlay = await json("src-tauri/tauri.updater.conf.json");
  assert.deepEqual(overlay, { bundle: { createUpdaterArtifacts: true } });
});
