import type { VaultEntry } from "./api";

export interface MoveDestination {
  path: string;
  label: string;
  disabledReason: string | null;
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

function hasName(entries: VaultEntry[], name: string): boolean {
  const normalized = name.toLowerCase();
  return entries.some((entry) => entry.name.toLowerCase() === normalized);
}

export function noteWikilink(path: string): string | null {
  if (!path.toLowerCase().endsWith(".md")) return null;
  return `[[${path.slice(0, -3)}]]`;
}

export function moveDestinations(
  tree: VaultEntry[],
  source: VaultEntry,
): MoveDestination[] {
  const currentParent = parentPath(source.path);
  const destinations: Array<{ path: string; children: VaultEntry[] }> = [
    { path: "", children: tree },
  ];

  function collect(entries: VaultEntry[]): void {
    for (const entry of entries) {
      if (entry.kind !== "folder") continue;
      if (
        source.kind === "folder" &&
        (entry.path === source.path || entry.path.startsWith(`${source.path}/`))
      ) {
        continue;
      }
      destinations.push({ path: entry.path, children: entry.children });
      collect(entry.children);
    }
  }

  collect(tree);

  return destinations
    .sort((left, right) => {
      if (!left.path) return -1;
      if (!right.path) return 1;
      return left.path.localeCompare(right.path, undefined, {
        sensitivity: "base",
      });
    })
    .map(({ path, children }) => ({
      path,
      label: path || "Vault root",
      disabledReason:
        path === currentParent
          ? "Current folder"
          : hasName(children, source.name)
            ? `Already contains “${source.name}”`
            : null,
    }));
}
