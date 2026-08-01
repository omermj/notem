import { readFileSync } from "node:fs";
import nspell from "nspell";
import { describe, expect, it } from "vitest";

describe("English spellcheck dictionary", () => {
  const checker = nspell(
    readFileSync("node_modules/dictionary-en/index.aff", "utf8"),
    readFileSync("node_modules/dictionary-en/index.dic", "utf8"),
  );

  it("detects misspellings and provides corrections", () => {
    expect(checker.correct("sentence")).toBe(true);
    expect(checker.correct("sentnce")).toBe(false);
    expect(checker.suggest("sentnce")).toContain("sentence");
  });
});
