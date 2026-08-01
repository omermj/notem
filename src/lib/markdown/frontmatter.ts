export interface MarkdownDocumentParts {
  prefix: string;
  body: string;
  bodyOffset: number;
  bodyLineOffset: number;
}

const wholeDocument = (content: string): MarkdownDocumentParts => ({
  prefix: "",
  body: content,
  bodyOffset: 0,
  bodyLineOffset: 0,
});

export function splitFrontmatter(content: string): MarkdownDocumentParts {
  const firstLineEnd = content.indexOf("\n");
  if (firstLineEnd < 0) return wholeDocument(content);
  const firstLine = content.slice(0, firstLineEnd).replace(/\r$/, "");
  if (firstLine !== "---") return wholeDocument(content);

  let lineStart = firstLineEnd + 1;
  while (lineStart <= content.length) {
    const newline = content.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? content.length : newline;
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (line === "---") {
      let bodyOffset = newline < 0 ? content.length : newline + 1;
      while (bodyOffset < content.length) {
        if (content.startsWith("\r\n", bodyOffset)) bodyOffset += 2;
        else if (content[bodyOffset] === "\n" || content[bodyOffset] === "\r")
          bodyOffset += 1;
        else break;
      }
      const prefix = content.slice(0, bodyOffset);
      return {
        prefix,
        body: content.slice(bodyOffset),
        bodyOffset,
        bodyLineOffset: prefix.split("\n").length - 1,
      };
    }
    if (newline < 0) break;
    lineStart = newline + 1;
  }

  return wholeDocument(content);
}

export function replaceMarkdownBody(content: string, body: string): string {
  const { prefix } = splitFrontmatter(content);
  if (!prefix) return body;
  const separator =
    body && !prefix.endsWith("\n") && !prefix.endsWith("\r") ? "\n" : "";
  return `${prefix}${separator}${body}`;
}
