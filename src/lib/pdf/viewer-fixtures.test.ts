import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const fixtures = resolve(
  "src-tauri/tests/fixtures/vault/attachments/pdf-fixtures",
);

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(resolve(fixtures, name)));
}

describe("PDF.js fixtures", () => {
  it("loads pages and extracts searchable text", async () => {
    const task = getDocument({ data: fixture("viewer-guide.pdf") });
    const document = await task.promise;
    expect(document.numPages).toBe(3);
    const page = await document.getPage(1);
    const text = await page.getTextContent();
    expect(
      text.items
        .filter((item) => "str" in item)
        .map((item) => item.str)
        .join(" "),
    ).toContain("local-first knowledge base");
    await task.destroy();
  });

  it("opens the password fixture with the documented password", async () => {
    const task = getDocument({
      data: fixture("password-notem.pdf"),
      password: "notem",
    });
    expect((await task.promise).numPages).toBe(3);
    await task.destroy();
  });

  it("rejects a corrupt PDF without crashing the test process", async () => {
    const task = getDocument({ data: fixture("corrupt.pdf") });
    await expect(task.promise).rejects.toThrow();
    await task.destroy();
  });
});
