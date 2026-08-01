const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function externalUrl(value: string): string | null {
  const trimmed = value.trim();
  const destination =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  try {
    const parsed = new URL(destination);
    return EXTERNAL_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
