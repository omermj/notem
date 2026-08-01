import { externalUrl } from "./externalLinks";
import { parsePdfTarget, type PdfTarget } from "./pdf/targets";

export type ReadingLinkAction =
  | { kind: "external"; url: string }
  | { kind: "pdf"; target: PdfTarget }
  | { kind: "inert" };

export function readingLinkAction(destination: string): ReadingLinkAction {
  const external = externalUrl(destination);
  if (external) return { kind: "external", url: external };

  const trimmed = destination.trim();
  const unwrapped =
    trimmed.startsWith("<") && trimmed.endsWith(">")
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(unwrapped) || unwrapped.startsWith("//")) {
    return { kind: "inert" };
  }

  const pdf = parsePdfTarget(unwrapped);
  return pdf ? { kind: "pdf", target: pdf } : { kind: "inert" };
}
