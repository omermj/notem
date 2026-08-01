import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { externalUrlAt } from "./links";

function state(document: string): EditorState {
  return EditorState.create({ doc: document, extensions: [markdown()] });
}

describe("externalUrlAt", () => {
  it("resolves a Markdown link from its label or destination", () => {
    const document = "[OpenAI](https://openai.com)";
    const editor = state(document);

    expect(externalUrlAt(editor, document.indexOf("OpenAI") + 2)).toBe(
      "https://openai.com/",
    );
    expect(externalUrlAt(editor, document.indexOf("openai.com") + 2)).toBe(
      "https://openai.com/",
    );
  });

  it("resolves autolinks and bare links", () => {
    const document = "<mailto:hello@example.com> and https://example.com/docs.";
    const editor = state(document);

    expect(externalUrlAt(editor, document.indexOf("hello"))).toBe(
      "mailto:hello@example.com",
    );
    expect(externalUrlAt(editor, document.lastIndexOf("example.com"))).toBe(
      "https://example.com/docs",
    );
  });

  it("keeps external PDFs external and ignores relative links", () => {
    const external = "[Guide](https://example.com/Guide.pdf)";
    const relative = "[Guide](attachments/Guide.pdf)";

    expect(externalUrlAt(state(external), external.indexOf("Guide"))).toBe(
      "https://example.com/Guide.pdf",
    );
    expect(
      externalUrlAt(state(relative), relative.indexOf("Guide")),
    ).toBeNull();
  });
});
