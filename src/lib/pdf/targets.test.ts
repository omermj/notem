import { describe, expect, it } from "vitest";
import { parsePdfTarget, pdfEmbedMarkdown } from "./targets";

describe("parsePdfTarget", () => {
  it("parses Obsidian-compatible page and height fragments", () => {
    expect(parsePdfTarget("attachments/Guide.pdf#page=3&height=420")).toEqual({
      source: "attachments/Guide.pdf",
      page: 3,
      height: 420,
    });
  });

  it("rejects non-PDF targets and bounds unsafe dimensions", () => {
    expect(parsePdfTarget("Guide.md")).toBeNull();
    expect(parsePdfTarget("Guide.PDF#page=-5&height=9000")).toEqual({
      source: "Guide.PDF",
      page: 1,
      height: 2_000,
    });
  });

  it("accepts angle-bracket Markdown destinations", () => {
    expect(parsePdfTarget("<attachments/My Guide.pdf#page=2>")).toEqual({
      source: "attachments/My Guide.pdf",
      page: 2,
      height: null,
    });
  });
});

describe("pdfEmbedMarkdown", () => {
  it("creates an embedded wikilink", () => {
    expect(pdfEmbedMarkdown("attachments/Guide.pdf")).toBe(
      "![[attachments/Guide.pdf]]",
    );
  });
});
