import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { externalUrl } from "../externalLinks";

const BARE_EXTERNAL_URL = /(?:https?:\/\/|mailto:)[^\s<>"']+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

export function externalUrlAt(
  state: EditorState,
  position: number,
): string | null {
  let node = syntaxTree(state).resolveInner(position, -1);
  for (;;) {
    if (node.name === "Link" || node.name === "Autolink") {
      const urlNode = node.getChild("URL");
      if (urlNode) {
        return externalUrl(state.doc.sliceString(urlNode.from, urlNode.to));
      }
      break;
    }
    if (!node.parent) break;
    node = node.parent;
  }

  const line = state.doc.lineAt(position);
  const offset = position - line.from;
  for (const match of line.text.matchAll(BARE_EXTERNAL_URL)) {
    const start = match.index ?? 0;
    const candidate = trimBareUrl(match[0]);
    const end = start + candidate.length;
    if (offset >= start && offset <= end) return externalUrl(candidate);
  }
  return null;
}

function trimBareUrl(value: string): string {
  let trimmed = value.replace(TRAILING_PUNCTUATION, "");
  for (const [opening, closing] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]) {
    while (
      trimmed.endsWith(closing) &&
      count(trimmed, closing) > count(trimmed, opening)
    ) {
      trimmed = trimmed.slice(0, -1);
    }
  }
  return trimmed;
}

function count(value: string, character: string): number {
  return [...value].filter((candidate) => candidate === character).length;
}
