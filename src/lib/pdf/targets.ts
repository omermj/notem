export interface PdfTarget {
  source: string;
  page: number;
  height: number | null;
}

export function parsePdfTarget(rawTarget: string): PdfTarget | null {
  const trimmed = rawTarget.trim();
  const target =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const hash = target.indexOf("#");
  const source = (hash < 0 ? target : target.slice(0, hash)).trim();
  if (!source.toLowerCase().endsWith(".pdf")) return null;

  let page = 1;
  let height: number | null = null;
  const fragment = hash < 0 ? "" : target.slice(hash + 1);
  for (const part of fragment.split(/[&,]/)) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = rawKey?.trim().toLowerCase();
    const value = Number.parseInt(rawValue?.trim() ?? "", 10);
    if (!Number.isFinite(value)) continue;
    if (key === "page") page = Math.max(1, value);
    if (key === "height") height = Math.max(200, Math.min(2_000, value));
  }
  return { source, page, height };
}

export function pdfEmbedMarkdown(path: string): string {
  return `![[${path.replaceAll("]", "\\]")}]]`;
}
