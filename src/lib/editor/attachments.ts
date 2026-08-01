import type { ImportedAttachment } from "../api";
import { markdownLink } from "../drag";
import { pdfEmbedMarkdown } from "../pdf/targets";
import { imageAlt, markdownImage } from "./paths";

export function attachmentMarkdown(attachment: ImportedAttachment): string {
  if (attachment.isImage) {
    return `${markdownImage(
      attachment.markdownPath,
      imageAlt(attachment.markdownPath),
    )}\n`;
  }
  if (attachment.markdownPath.toLowerCase().endsWith(".md")) {
    return `${markdownLink(attachment.vaultPath)}\n`;
  }
  if (attachment.markdownPath.toLowerCase().endsWith(".pdf")) {
    return `${pdfEmbedMarkdown(attachment.markdownPath)}\n`;
  }
  const label = attachment.markdownPath.split("/").at(-1) ?? "attachment";
  const destination = `<${attachment.markdownPath
    .replaceAll("%", "%25")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F")
    .replaceAll(">", "%3E")}>`;
  return `[${label.replaceAll("]", "\\]")}](${destination})\n`;
}
