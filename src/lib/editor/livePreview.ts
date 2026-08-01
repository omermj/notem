import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { mount, unmount } from "svelte";
import PdfEmbed from "../components/PdfEmbed.svelte";
import { externalUrl } from "../externalLinks";
import { parsePdfTarget } from "../pdf/targets";
import { taskMarkerRange } from "./tasks";

export interface LivePreviewActions {
  sourcePath: string;
  openWikilink(target: string, newTab: boolean): void;
  openPdf(target: string, newTab: boolean): void;
  openExternal(url: string): void;
  selectTag(tag: string): void;
  imageUrl(path: string): string | null;
}

const mountedPdfWidgets = new WeakMap<HTMLElement, ReturnType<typeof mount>>();

class TextWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly className: string,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    return span;
  }
}

class WikilinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly display: string,
    private readonly open: (target: string, newTab: boolean) => void,
  ) {
    super();
  }

  eq(other: WikilinkWidget): boolean {
    return other.target === this.target && other.display === this.display;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-wikilink";
    button.textContent = this.display;
    button.title = `Open ${this.target}`;
    button.onclick = (event) =>
      this.open(this.target, event.metaKey || event.ctrlKey);
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class PdfLinkWidget extends WidgetType {
  constructor(
    private readonly target: string,
    private readonly display: string,
    private readonly open: (target: string, newTab: boolean) => void,
  ) {
    super();
  }

  eq(other: PdfLinkWidget): boolean {
    return other.target === this.target && other.display === this.display;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-live-link cm-pdf-link";
    button.textContent = this.display;
    button.title = `Open ${this.target}`;
    button.onclick = (event) =>
      this.open(this.target, event.metaKey || event.ctrlKey);
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class ExternalLinkWidget extends WidgetType {
  constructor(
    private readonly url: string,
    private readonly display: string,
    private readonly open: (url: string) => void,
  ) {
    super();
  }

  eq(other: ExternalLinkWidget): boolean {
    return other.url === this.url && other.display === this.display;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-live-link cm-external-link";
    button.textContent = this.display;
    button.title = `Open ${this.url}`;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open(this.url);
    };
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class TagWidget extends WidgetType {
  constructor(
    private readonly tag: string,
    private readonly select: (tag: string) => void,
  ) {
    super();
  }

  eq(other: TagWidget): boolean {
    return other.tag === this.tag;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-tag";
    button.textContent = `#${this.tag}`;
    button.title = `Filter by #${this.tag}`;
    button.onclick = () => this.select(this.tag);
    return button;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cm-task-checkbox";
    checkbox.checked = this.checked;
    checkbox.ariaLabel = this.checked
      ? "Mark task incomplete"
      : "Mark task complete";
    checkbox.onchange = () => {
      view.dispatch({
        changes: {
          from: this.from + 1,
          to: this.from + 2,
          insert: checkbox.checked ? "x" : " ",
        },
      });
      view.focus();
    };
    return checkbox;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly source: string | null,
    private readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.source === this.source && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const container = document.createElement("figure");
    container.className = "cm-inline-image";
    const image = document.createElement("img");
    image.alt = this.alt;
    image.loading = "lazy";
    container.append(image);
    const showError = (): void => {
      container.classList.add("image-load-failed");
      if (!container.querySelector("figcaption")) {
        const message = document.createElement("figcaption");
        message.textContent = this.alt
          ? `Could not load image: ${this.alt}`
          : "Could not load image";
        container.append(message);
      }
    };
    if (this.source) {
      image.src = this.source;
      image.onerror = showError;
    } else {
      showError();
    }
    return container;
  }
}

class PdfWidget extends WidgetType {
  constructor(
    private readonly sourcePath: string,
    private readonly target: string,
  ) {
    super();
  }

  eq(other: PdfWidget): boolean {
    return other.sourcePath === this.sourcePath && other.target === this.target;
  }

  toDOM(): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-pdf-embed";
    const component = mount(PdfEmbed, {
      target: container,
      props: {
        sourcePath: this.sourcePath,
        target: this.target,
      },
    });
    mountedPdfWidgets.set(container, component);
    return container;
  }

  destroy(dom: HTMLElement): void {
    const component = mountedPdfWidgets.get(dom);
    if (component) void unmount(component);
    mountedPdfWidgets.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function lineIsActive(view: EditorView, from: number, to: number): boolean {
  return selectionTouchesLine(view.state, from, to);
}

function selectionTouchesLine(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );
}

function frontmatterEnd(doc: Text): number {
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return -1;
  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber);
    if (line.text.trim() === "---") return line.to;
  }
  return -1;
}

function addInlineFormatting(
  ranges: Array<ReturnType<Decoration["range"]>>,
  text: string,
  offset: number,
): void {
  const patterns: Array<{ expression: RegExp; className: string }> = [
    { expression: /(\*\*|__)(?=\S)(.+?\S)\1/g, className: "cm-live-strong" },
    {
      expression: /(?<!\*)\*(?!\*)(?=\S)(.+?\S)\*(?!\*)/g,
      className: "cm-live-em",
    },
    {
      expression: /(?<!_)_(?!_)(?=\S)(.+?\S)_(?!_)/g,
      className: "cm-live-em",
    },
  ];
  for (const { expression, className } of patterns) {
    for (const match of text.matchAll(expression)) {
      const start = offset + (match.index ?? 0);
      const markerSize = match[1] === "**" || match[1] === "__" ? 2 : 1;
      const end = start + match[0].length;
      ranges.push(Decoration.replace({}).range(start, start + markerSize));
      ranges.push(
        Decoration.mark({ class: className }).range(
          start + markerSize,
          end - markerSize,
        ),
      );
      ranges.push(Decoration.replace({}).range(end - markerSize, end));
    }
  }
}

function buildDecorations(
  view: EditorView,
  actions: LivePreviewActions,
  frontmatterTo: number,
): DecorationSet {
  const ranges: Array<ReturnType<Decoration["range"]>> = [];
  for (const visible of view.visibleRanges) {
    let position = view.state.doc.lineAt(visible.from).from;
    while (position <= visible.to) {
      const line = view.state.doc.lineAt(position);
      if (
        line.from > frontmatterTo &&
        !lineIsActive(view, line.from, line.to)
      ) {
        decorateLine(ranges, line.text, line.from, line.to, actions);
      }
      if (line.to >= view.state.doc.length) break;
      position = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

function buildMediaDecorations(
  state: EditorState,
  actions: LivePreviewActions,
  frontmatterTo: number,
): DecorationSet {
  const ranges: Array<ReturnType<Decoration["range"]>> = [];
  const document = state.doc;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Image" || node.from <= frontmatterTo) return;
      const line = document.lineAt(node.from);
      if (selectionTouchesLine(state, line.from, line.to)) return;
      const url = node.node.getChild("URL");
      if (!url) return;
      const marks = node.node.getChildren("LinkMark");
      const altEnd = marks.find(
        (mark) => document.sliceString(mark.from, mark.to) === "]",
      );
      const alt = altEnd
        ? document
            .sliceString(node.from + 2, altEnd.from)
            .replace(/\\(.)/g, "$1")
        : "";
      const source = document.sliceString(url.from, url.to);
      ranges.push(Decoration.replace({}).range(node.from, node.to));
      ranges.push(
        Decoration.widget({
          widget: new ImageWidget(actions.imageUrl(source), alt),
          block: true,
          side: 1,
        }).range(line.to),
      );
    },
  });
  for (let lineNumber = 1; lineNumber <= document.lines; lineNumber += 1) {
    const line = document.line(lineNumber);
    if (
      line.from <= frontmatterTo ||
      selectionTouchesLine(state, line.from, line.to)
    ) {
      continue;
    }
    const match = /^\s*!\[\[([^\]\n]+)\]\]\s*$/.exec(line.text);
    const target = match?.[1]?.split("|", 1)[0]?.trim();
    if (!target || !parsePdfTarget(target)) continue;
    ranges.push(Decoration.replace({}).range(line.from, line.to));
    ranges.push(
      Decoration.widget({
        widget: new PdfWidget(actions.sourcePath, target),
        block: true,
        side: 1,
      }).range(line.to),
    );
  }
  return Decoration.set(ranges, true);
}

function mediaPreviewField(
  actions: LivePreviewActions,
): StateField<DecorationSet> {
  return StateField.define<DecorationSet>({
    create(state) {
      const frontmatterTo = frontmatterEnd(state.doc);
      return buildMediaDecorations(state, actions, frontmatterTo);
    },
    update(value, transaction) {
      if (
        transaction.docChanged ||
        !transaction.startState.selection.eq(transaction.state.selection)
      ) {
        const frontmatterTo = frontmatterEnd(transaction.state.doc);
        return buildMediaDecorations(transaction.state, actions, frontmatterTo);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function decorateLine(
  ranges: Array<ReturnType<Decoration["range"]>>,
  text: string,
  from: number,
  to: number,
  actions: LivePreviewActions,
): void {
  const heading = /^(#{1,6})\s+/.exec(text);
  if (heading) {
    ranges.push(Decoration.replace({}).range(from, from + heading[0].length));
    ranges.push(
      Decoration.mark({
        class: `cm-live-heading cm-live-h${heading[1].length}`,
      }).range(from + heading[0].length, to),
    );
  }

  const quote = /^(\s*)>\s?/.exec(text);
  if (quote) {
    ranges.push(
      Decoration.line({ class: "cm-live-blockquote" }).range(from),
      Decoration.replace({}).range(
        from + quote[1].length,
        from + quote[0].length,
      ),
    );
  }

  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text)) {
    ranges.push(
      Decoration.line({ class: "cm-live-hr" }).range(from),
      Decoration.replace({}).range(from, to),
    );
    return;
  }

  const taskMarker = taskMarkerRange(text);
  if (taskMarker) {
    ranges.push(
      Decoration.replace({}).range(
        from + taskMarker.from,
        from + taskMarker.to,
      ),
    );
  }

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const start = from + (match.index ?? 0);
    const end = start + match[0].length;
    ranges.push(
      Decoration.replace({}).range(start, start + 1),
      Decoration.mark({ class: "cm-live-code" }).range(start + 1, end - 1),
      Decoration.replace({}).range(end - 1, end),
    );
  }

  for (const match of text.matchAll(
    /(?<!!)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g,
  )) {
    const start = from + (match.index ?? 0);
    ranges.push(
      Decoration.replace({
        widget: new WikilinkWidget(
          match[1],
          match[2] ?? match[1].split("#", 1)[0],
          actions.openWikilink,
        ),
      }).range(start, start + match[0].length),
    );
  }

  for (const match of text.matchAll(/(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g)) {
    const start = from + (match.index ?? 0);
    const external = externalUrl(match[2]);
    const pdf = external ? null : parsePdfTarget(match[2]);
    ranges.push(
      Decoration.replace({
        widget: external
          ? new ExternalLinkWidget(external, match[1], actions.openExternal)
          : pdf
            ? new PdfLinkWidget(match[2], match[1], actions.openPdf)
            : new TextWidget(match[1], "cm-live-link"),
      }).range(start, start + match[0].length),
    );
  }

  for (const match of text.matchAll(/\[( |x|X)\]/g)) {
    const start = from + (match.index ?? 0);
    ranges.push(
      Decoration.replace({
        widget: new CheckboxWidget(match[1].toLowerCase() === "x", start),
      }).range(start, start + match[0].length),
    );
  }

  for (const match of text.matchAll(/(^|[\s(])#([\p{L}\p{N}_/-]+)/gu)) {
    const start = from + (match.index ?? 0) + match[1].length;
    if (heading && start === from) continue;
    ranges.push(
      Decoration.replace({
        widget: new TagWidget(match[2], actions.selectTag),
      }).range(start, start + match[0].length - match[1].length),
    );
  }

  addInlineFormatting(ranges, text, from);
}

export function livePreview(actions: LivePreviewActions): Extension {
  return [
    mediaPreviewField(actions),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        frontmatterTo: number;

        constructor(view: EditorView) {
          this.frontmatterTo = frontmatterEnd(view.state.doc);
          this.decorations = buildDecorations(
            view,
            actions,
            this.frontmatterTo,
          );
        }

        update(update: ViewUpdate): void {
          if (update.docChanged) {
            this.frontmatterTo = frontmatterEnd(update.state.doc);
          }
          if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged ||
            update.geometryChanged
          ) {
            this.decorations = buildDecorations(
              update.view,
              actions,
              this.frontmatterTo,
            );
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  ];
}

export function wikilinkAt(text: string, offset: number): string | null {
  for (const match of text.matchAll(/\[\[([^\]|\n]+)(?:\|[^\]\n]+)?\]\]/g)) {
    const start = match.index ?? 0;
    if (offset >= start && offset <= start + match[0].length) return match[1];
  }
  return null;
}
