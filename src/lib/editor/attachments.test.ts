import { describe, expect, it } from "vitest";
import type { ImportedAttachment } from "../api";
import { attachmentMarkdown } from "./attachments";

function attachment(
  overrides: Partial<ImportedAttachment>,
): ImportedAttachment {
  return {
    vaultPath: "Projects/attachments/Reference.pdf",
    markdownPath: "attachments/Reference.pdf",
    mediaType: "application/pdf",
    isImage: false,
    ...overrides,
  };
}

describe("attachmentMarkdown", () => {
  it("inserts imported PDFs as note-relative embeds", () => {
    expect(attachmentMarkdown(attachment({}))).toBe(
      "![[attachments/Reference.pdf]]\n",
    );
  });

  it("keeps image and ordinary attachment syntax intact", () => {
    expect(
      attachmentMarkdown(
        attachment({
          vaultPath: "Projects/attachments/Diagram.png",
          markdownPath: "attachments/Diagram.png",
          mediaType: "image/png",
          isImage: true,
        }),
      ),
    ).toBe("![Diagram](<attachments/Diagram.png>)\n");
    expect(
      attachmentMarkdown(
        attachment({
          vaultPath: "Projects/attachments/Data.csv",
          markdownPath: "attachments/Data.csv",
          mediaType: "application/octet-stream",
        }),
      ),
    ).toBe("[Data.csv](<attachments/Data.csv>)\n");
  });
});
