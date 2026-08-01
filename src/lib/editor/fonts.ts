export const EDITOR_FONTS = [
  {
    id: "default",
    label: "Default monospace",
    family: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  {
    id: "system-sans",
    label: "System sans-serif",
    family: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    id: "system-serif",
    label: "System serif",
    family: "ui-serif, Georgia, Cambria, serif",
  },
  {
    id: "jetbrains-mono",
    label: "JetBrains Mono",
    family: '"JetBrains Mono", ui-monospace, monospace',
  },
  {
    id: "fira-code",
    label: "Fira Code",
    family: '"Fira Code", ui-monospace, monospace',
  },
  {
    id: "cascadia-code",
    label: "Cascadia Code",
    family: '"Cascadia Code", ui-monospace, monospace',
  },
  {
    id: "courier-new",
    label: "Courier New",
    family: '"Courier New", Courier, monospace',
  },
] as const;

export type EditorFont = (typeof EDITOR_FONTS)[number]["id"];

export const DEFAULT_EDITOR_FONT: EditorFont = "default";

export function normalizeEditorFont(font: string): EditorFont {
  return (
    EDITOR_FONTS.find((option) => option.id === font)?.id ?? DEFAULT_EDITOR_FONT
  );
}

export function editorFontFamily(font: string): string {
  const normalized = normalizeEditorFont(font);
  return (
    EDITOR_FONTS.find((option) => option.id === normalized)?.family ??
    EDITOR_FONTS[0].family
  );
}
