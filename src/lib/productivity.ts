import type { VaultEntry } from "./api";

export function formatDate(date: Date, format: string): string {
  const values: Record<string, string> = {
    YYYY: String(date.getFullYear()).padStart(4, "0"),
    MM: String(date.getMonth() + 1).padStart(2, "0"),
    DD: String(date.getDate()).padStart(2, "0"),
  };
  return format.replace(/YYYY|MM|DD/g, (token) => values[token] ?? token);
}

export function templateVariables(
  content: string,
  title: string,
  now = new Date(),
): string {
  const date = formatDate(now, "YYYY-MM-DD");
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  return content
    .replaceAll("{{date}}", date)
    .replaceAll("{{time}}", time)
    .replaceAll("{{title}}", title);
}

export function normalizeFolder(folder: string): string {
  const normalized = folder
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
  return normalized ? `${normalized}/` : "";
}

export function templatePaths(
  tree: VaultEntry[],
  templatesFolder: string,
): string[] {
  const prefix = normalizeFolder(templatesFolder).toLowerCase();
  const paths: string[] = [];
  const visit = (entries: VaultEntry[]): void => {
    for (const entry of entries) {
      if (entry.kind === "file" && entry.path.toLowerCase().endsWith(".md")) {
        if (!prefix || entry.path.toLowerCase().startsWith(prefix)) {
          paths.push(entry.path);
        }
      } else if (entry.kind === "folder") {
        visit(entry.children);
      }
    }
  };
  visit(tree);
  return paths.sort((left, right) => left.localeCompare(right));
}

export function noteTitle(path: string): string {
  return path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "Untitled";
}

export function safeNoteName(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]/g, "-") || "Untitled";
}
