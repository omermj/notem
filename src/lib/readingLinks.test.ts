import { describe, expect, it } from "vitest";
import { readingLinkAction } from "./readingLinks";

describe("readingLinkAction", () => {
  it("allows only explicitly supported external schemes", () => {
    expect(readingLinkAction("https://example.com/docs")).toEqual({
      kind: "external",
      url: "https://example.com/docs",
    });
    expect(readingLinkAction("mailto:hello@example.com")).toEqual({
      kind: "external",
      url: "mailto:hello@example.com",
    });
  });

  it("dispatches vault-relative PDF links", () => {
    expect(readingLinkAction("attachments/Guide.pdf#page=3")).toEqual({
      kind: "pdf",
      target: {
        source: "attachments/Guide.pdf",
        page: 3,
        height: null,
      },
    });
  });

  it.each([
    "ftp://example.com/file.pdf",
    "custom:payload",
    "javascript:alert(1)",
    "file:///tmp/note.md",
    "//example.com/file.pdf",
    "Guide.md",
    "#heading",
    "",
  ])("keeps unsupported destination %s inert", (destination) => {
    expect(readingLinkAction(destination)).toEqual({ kind: "inert" });
  });
});
