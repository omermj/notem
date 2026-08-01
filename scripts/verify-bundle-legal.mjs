import { constants, promises as fs } from "node:fs";
import path from "node:path";

const searchRoot = path.resolve(process.argv[2] ?? "src-tauri/target");
const expected = new Map([
  ["LICENSE", await fs.readFile(path.resolve("LICENSE"))],
  [
    "THIRD_PARTY_NOTICES.md",
    await fs.readFile(path.resolve("THIRD_PARTY_NOTICES.md")),
  ],
]);
const matches = new Map([...expected.keys()].map((name) => [name, []]));

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath);
      continue;
    }
    if (
      entry.isFile() &&
      expected.has(entry.name) &&
      entryPath.split(path.sep).includes("release")
    ) {
      matches.get(entry.name).push(entryPath);
    }
  }
}

await fs.access(searchRoot, constants.R_OK);
await walk(searchRoot);

for (const [name, source] of expected) {
  const candidates = matches.get(name);
  if (candidates.length === 0) {
    throw new Error(`Bundled ${name} was not found below ${searchRoot}`);
  }
  for (const candidate of candidates) {
    const bundled = await fs.readFile(candidate);
    if (!bundled.equals(source)) {
      throw new Error(
        `Bundled ${candidate} differs from the repository ${name}`,
      );
    }
  }
  console.log(
    `Verified ${candidates.length} byte-identical bundled ${name} file(s).`,
  );
}
