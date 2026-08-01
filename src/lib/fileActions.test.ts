import { describe, expect, it } from "vitest";
import type { VaultEntry } from "./api";
import { moveDestinations, noteWikilink } from "./fileActions";

const tree: VaultEntry[] = [
  {
    name: "Archive",
    path: "Archive",
    kind: "folder",
    children: [
      {
        name: "Roadmap.md",
        path: "Archive/Roadmap.md",
        kind: "file",
        children: [],
      },
    ],
  },
  {
    name: "Projects",
    path: "Projects",
    kind: "folder",
    children: [
      {
        name: "Roadmap.md",
        path: "Projects/Roadmap.md",
        kind: "file",
        children: [],
      },
      {
        name: "Research",
        path: "Projects/Research",
        kind: "folder",
        children: [],
      },
    ],
  },
];

describe("noteWikilink", () => {
  it("copies an unambiguous vault-relative note identity", () => {
    expect(noteWikilink("Projects/Roadmap.md")).toBe("[[Projects/Roadmap]]");
    expect(noteWikilink("Notes/Upper.MD")).toBe("[[Notes/Upper]]");
  });

  it("does not create wikilinks for folders or non-Markdown files", () => {
    expect(noteWikilink("Projects")).toBeNull();
    expect(noteWikilink("document.pdf")).toBeNull();
  });
});

describe("moveDestinations", () => {
  it("marks the current folder and name conflicts as unavailable", () => {
    const source = tree[1].children[0];
    expect(moveDestinations(tree, source)).toEqual([
      { path: "", label: "Vault root", disabledReason: null },
      {
        path: "Archive",
        label: "Archive",
        disabledReason: "Already contains “Roadmap.md”",
      },
      {
        path: "Projects",
        label: "Projects",
        disabledReason: "Current folder",
      },
      {
        path: "Projects/Research",
        label: "Projects/Research",
        disabledReason: null,
      },
    ]);
  });

  it("excludes a folder and all of its descendants", () => {
    const source = tree[1];
    expect(moveDestinations(tree, source).map(({ path }) => path)).toEqual([
      "",
      "Archive",
    ]);
  });
});
