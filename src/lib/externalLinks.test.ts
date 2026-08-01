import { describe, expect, it } from "vitest";
import { externalUrl } from "./externalLinks";

describe("externalUrl", () => {
  it.each([
    ["https://example.com/docs", "https://example.com/docs"],
    ["http://example.com", "http://example.com/"],
    ["mailto:hello@example.com", "mailto:hello@example.com"],
    ["<https://example.com/a%20b>", "https://example.com/a%20b"],
  ])("accepts supported external destination %s", (destination, expected) => {
    expect(externalUrl(destination)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "file:///tmp/note.md",
    "ftp://example.com/file",
    "attachments/Guide.pdf",
    "#heading",
    "",
  ])("rejects unsupported or relative destination %s", (destination) => {
    expect(externalUrl(destination)).toBeNull();
  });
});
