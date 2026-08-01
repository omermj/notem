import MarkdownIt from "markdown-it";

export interface MarkdownEnvironment {
  imageUrl?: (path: string) => string | null;
}

function pdfEmbedPlugin(md: MarkdownIt): void {
  md.block.ruler.before(
    "paragraph",
    "pdf_embed",
    (state, startLine, _endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const end = state.eMarks[startLine];
      const line = state.src.slice(start, end).trim();
      const match = /^!\[\[([^\]\n]+)\]\]$/.exec(line);
      const target = match?.[1]?.split("|", 1)[0]?.trim();
      const file = target?.split("#", 1)[0]?.trim();
      if (!target || !file?.toLowerCase().endsWith(".pdf")) return false;
      if (!silent) {
        const token = state.push("pdf_embed", "div", 0);
        token.block = true;
        token.map = [startLine, startLine + 1];
        token.meta = { target };
      }
      state.line = startLine + 1;
      return true;
    },
  );
  md.renderer.rules.pdf_embed = (tokens, index) => {
    const meta = tokens[index].meta as { target: string };
    return `<div class="reading-pdf-embed" data-pdf-embed="${md.utils.escapeHtml(meta.target)}"></div>`;
  };
}

function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    if (state.src.slice(state.pos, state.pos + 2) !== "[[") return false;
    const end = state.src.indexOf("]]", state.pos + 2);
    if (end < 0) return false;
    const body = state.src.slice(state.pos + 2, end);
    const separator = body.indexOf("|");
    const target = (separator < 0 ? body : body.slice(0, separator)).trim();
    if (!target) return false;
    if (!silent) {
      const token = state.push("wikilink", "", 0);
      token.meta = {
        target,
        display:
          (separator < 0
            ? target.split("#", 1)[0]
            : body.slice(separator + 1)
          ).trim() || target,
      };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, index) => {
    const meta = tokens[index].meta as { target: string; display: string };
    return `<button type="button" class="reading-wikilink" data-wikilink="${md.utils.escapeHtml(meta.target)}">${md.utils.escapeHtml(meta.display)}</button>`;
  };
}

function tagPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "notem_tag", (state, silent) => {
    if (state.src[state.pos] !== "#") return false;
    const previous = state.pos > 0 ? state.src[state.pos - 1] : "";
    if (previous && !/[\s(]/.test(previous)) return false;
    const match = /^#([\p{L}\p{N}_/-]+)/u.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) {
      const token = state.push("notem_tag", "", 0);
      token.content = match[1];
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.notem_tag = (tokens, index) => {
    const tag = tokens[index].content;
    return `<button type="button" class="reading-tag" data-tag="${md.utils.escapeHtml(tag)}">#${md.utils.escapeHtml(tag)}</button>`;
  };
}

function taskListPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "notem_tasks", (state) => {
    for (
      let tokenIndex = 0;
      tokenIndex < state.tokens.length;
      tokenIndex += 1
    ) {
      const token = state.tokens[tokenIndex];
      const task = /^\[( |x|X)\](?:\s|$)/.exec(token.content);
      if (token.type !== "inline" || !token.children || !task) continue;
      for (let index = tokenIndex - 1; index >= 0; index -= 1) {
        const parent = state.tokens[index];
        if (parent.type === "list_item_close") break;
        if (parent.type === "list_item_open") {
          parent.attrJoin("class", "task-list-item");
          break;
        }
      }
      const children = [];
      let markerPending = true;
      for (const child of token.children) {
        const marker =
          markerPending && child.type === "text"
            ? /^\[( |x|X)\]/.exec(child.content)
            : null;
        if (!marker) {
          children.push(child);
          continue;
        }
        markerPending = false;
        const checkbox = new state.Token("html_inline", "", 0);
        checkbox.content = `<input class="reading-task-checkbox" type="checkbox" disabled${marker[1] === " " ? "" : " checked"}>`;
        children.push(checkbox);
        if (marker[0].length < child.content.length) {
          const text = new state.Token("text", "", 0);
          text.content = child.content.slice(marker[0].length);
          children.push(text);
        }
      }
      token.children = children;
    }
  });
}

export function createMarkdownRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    breaks: false,
    html: false,
    linkify: true,
    typographer: true,
  });
  pdfEmbedPlugin(md);
  wikilinkPlugin(md);
  tagPlugin(md);
  taskListPlugin(md);
  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, index, options, environment, renderer) =>
      renderer.renderToken(tokens, index, options));
  md.renderer.rules.image = (tokens, index, options, environment, renderer) => {
    const env = environment as MarkdownEnvironment;
    const sourceIndex = tokens[index].attrIndex("src");
    if (sourceIndex >= 0 && env.imageUrl) {
      const source = tokens[index].attrs?.[sourceIndex]?.[1];
      if (source) {
        const resolved = env.imageUrl(source);
        if (resolved) {
          tokens[index].attrs![sourceIndex][1] = resolved;
        } else {
          tokens[index].attrs![sourceIndex][1] = "about:blank";
          tokens[index].attrSet("data-image-error", "Invalid image path");
        }
      }
    }
    return defaultImage(tokens, index, options, environment, renderer);
  };
  return md;
}

const renderer = createMarkdownRenderer();

export function renderMarkdown(
  content: string,
  environment: MarkdownEnvironment = {},
): string {
  return renderer.render(content, environment);
}
