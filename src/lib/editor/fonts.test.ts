import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_FONT,
  EDITOR_FONTS,
  editorFontFamily,
  normalizeEditorFont,
} from "./fonts";

describe("editor fonts", () => {
  it("resolves every selectable font to a CSS font stack", () => {
    for (const font of EDITOR_FONTS) {
      expect(editorFontFamily(font.id)).toBe(font.family);
    }
  });

  it("falls back to the default for an unknown persisted value", () => {
    expect(normalizeEditorFont("missing-font")).toBe(DEFAULT_EDITOR_FONT);
    expect(editorFontFamily("missing-font")).toBe(EDITOR_FONTS[0].family);
  });
});
