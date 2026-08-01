import { describe, expect, it } from "vitest";
import { wordsToCheck } from "./spellcheckWords";

describe("wordsToCheck", () => {
  it("returns word positions outside excluded Markdown ranges", () => {
    const text = "A sentnce with `const mispelled = true` text.";
    const codeFrom = text.indexOf("`");
    const codeTo = text.lastIndexOf("`") + 1;

    expect(wordsToCheck(text, [{ from: codeFrom, to: codeTo }])).toEqual([
      { from: 0, to: 1, word: "A" },
      { from: 2, to: 9, word: "sentnce" },
      { from: 10, to: 14, word: "with" },
      { from: 40, to: 44, word: "text" },
    ]);
  });

  it("ignores acronyms, camel-case identifiers, and likely proper nouns", () => {
    const text = "Use NoteM with Omer and HTTP APIs.";
    expect(wordsToCheck(text, []).map((word) => word.word)).toEqual([
      "Use",
      "with",
      "and",
    ]);
  });
});
