export interface NoteDrag {
  kind: "note";
  path: string;
}

export interface EntryDrag {
  kind: "entry";
  path: string;
  entryKind: "file" | "folder";
}

export interface TabDrag {
  kind: "tab";
  paneId: string;
  tabId: string;
}

export interface TagDrag {
  kind: "tag";
  tag: string;
}

export interface HeadingDrag {
  kind: "heading";
  path: string;
  line: number;
}

export type NotemDrag = NoteDrag | EntryDrag | TabDrag | TagDrag | HeadingDrag;

export function notePathFromDrag(payload: NotemDrag): string | null {
  if (payload.kind === "note") return payload.path;
  if (
    payload.kind === "entry" &&
    payload.entryKind === "file" &&
    payload.path.toLowerCase().endsWith(".md")
  ) {
    return payload.path;
  }
  return null;
}

export function markdownLink(path: string, embed = false): string {
  const target = path.replace(/\.md$/i, "");
  return `${embed ? "!" : ""}[[${target}]]`;
}
