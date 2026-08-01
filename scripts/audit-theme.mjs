import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = [
  "src/lib/components",
  "src/lib/editor",
  "src/lib/graph",
  "src/styles/base.css",
];
const colorPattern =
  /#[\da-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:white|black|red|blue|gray|grey)\b/gi;
const failures = [];

async function inspect(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(
    () => null,
  );
  if (entries) {
    for (const entry of entries) await inspect(join(path, entry.name));
    return;
  }
  if (![".css", ".svelte", ".ts"].includes(extname(path))) return;
  const lines = (await readFile(path, "utf8")).split("\n");
  lines.forEach((line, index) => {
    const code = line.replace(/white-space/g, "");
    if (colorPattern.test(code))
      failures.push(`${path}:${index + 1}: ${line.trim()}`);
    colorPattern.lastIndex = 0;
  });
}

for (const root of roots) await inspect(root);

if (failures.length) {
  console.error("Hardcoded component colors found; use theme variables:\n");
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Theme audit passed: component colors resolve through CSS variables.",
  );
}
