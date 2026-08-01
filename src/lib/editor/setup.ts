import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import {
  EditorState,
  Compartment,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  highlightActiveLine,
  keymap,
  placeholder,
  type DecorationSet,
} from "@codemirror/view";
import type { FilenameMatch } from "../api";
import { recordTypingLatency } from "../performance";
import { editorFontFamily, type EditorFont } from "./fonts";
import { externalUrlAt } from "./links";
import { livePreview, wikilinkAt } from "./livePreview";
import { spellcheckExtension } from "./spellcheck";

export interface EditorSetupOptions {
  sourcePath: string;
  parent: HTMLElement;
  doc: string;
  fontSize: number;
  font: EditorFont;
  readableLineLength: boolean;
  lineWidth: number;
  spellcheck: boolean;
  highlightActiveLine: boolean;
  onChange(content: string): void;
  openWikilink(target: string, newTab: boolean): void;
  openPdf(target: string, newTab: boolean): void;
  openExternal(url: string): void;
  selectTag(tag: string): void;
  imageUrl(path: string): string | null;
  importPastedFiles?(files: File[]): void;
  searchNotes(query: string): Promise<FilenameMatch[]>;
  initialCursor?: number;
  initialScrollTop?: number;
  onPosition?(cursor: number, scrollTop: number): void;
}

export interface MarkdownEditor {
  view: EditorView;
  setDocument(content: string): void;
  insert(text: string): void;
  updateSettings(settings: {
    fontSize: number;
    font: EditorFont;
    readableLineLength: boolean;
    lineWidth: number;
    spellcheck: boolean;
    highlightActiveLine: boolean;
  }): void;
  jumpToLine(line: number, start?: number, end?: number): void;
  destroy(): void;
}

const setFlash = StateEffect.define<{ from: number; to: number } | null>();
const flashHighlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let decorations = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setFlash)) continue;
      const range = effect.value;
      decorations = range
        ? Decoration.set([
            range.to > range.from
              ? Decoration.mark({ class: "cm-jump-flash" }).range(
                  range.from,
                  range.to,
                )
              : Decoration.line({ class: "cm-jump-flash" }).range(range.from),
          ])
        : Decoration.none;
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function wikilinkCompletion(
  searchNotes: (query: string) => Promise<FilenameMatch[]>,
) {
  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    const match = context.matchBefore(/\[\[[^\]\n]*/);
    if (!match) return null;
    const query = match.text.slice(2);
    const notes = await searchNotes(query);
    return {
      from: match.from + 2,
      options: notes.map((note) => ({
        label: note.path.replace(/\.md$/i, ""),
        detail: note.title || undefined,
        type: "text",
      })),
      validFor: /^[^\]\n]*$/,
    };
  };
}

function editorTheme(
  fontSize: number,
  font: EditorFont,
  lineWidth: number,
  readableLineLength: boolean,
): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      fontSize: `${fontSize}px`,
      backgroundColor: "var(--color-surface)",
      color: "var(--color-text)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: editorFontFamily(font),
      lineHeight: "1.7",
    },
    ".cm-content": {
      width: "100%",
      maxWidth: readableLineLength ? `${lineWidth}ch` : "none",
      minHeight: "100%",
      margin: readableLineLength ? "0 auto" : "0",
      padding: "32px clamp(24px, 7vw, 96px)",
      caretColor: "var(--color-accent)",
    },
    ".cm-focused": { outline: "none" },
    ".cm-line": { padding: "0" },
    ".cm-activeLine": {
      backgroundColor:
        "color-mix(in srgb, var(--color-accent) 5%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor:
        "color-mix(in srgb, var(--color-accent) 24%, transparent) !important",
    },
    ".cm-cursor": { borderLeftColor: "var(--color-accent)" },
    ".cm-panels": {
      color: "var(--color-text)",
      backgroundColor: "var(--color-sidebar)",
    },
    ".cm-search.cm-panel": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      padding: "8px 10px",
      borderBottom: "1px solid var(--color-border)",
    },
    ".cm-search input, .cm-search button": {
      border: "1px solid var(--color-border-strong)",
      borderRadius: "5px",
      color: "var(--color-text)",
      backgroundColor: "var(--color-surface)",
      font: "inherit",
    },
    ".cm-search input": { padding: "4px 7px" },
    ".cm-search button": { padding: "4px 7px", cursor: "pointer" },
    ".cm-searchMatch": {
      backgroundColor:
        "color-mix(in srgb, var(--color-accent) 25%, transparent)",
      outline: "1px solid var(--color-accent)",
    },
    ".cm-jump-flash": {
      backgroundColor:
        "color-mix(in srgb, var(--color-accent) 32%, transparent)",
      animation: "notem-jump-flash 1.2s ease-out",
    },
    ".cm-tooltip": {
      color: "var(--color-text)",
      backgroundColor: "var(--color-surface)",
      border: "1px solid var(--color-border-strong)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      color: "var(--color-text-strong)",
      backgroundColor:
        "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface))",
    },
  });
}

export function createMarkdownEditor(
  options: EditorSetupOptions,
): MarkdownEditor {
  let applyingExternalDocument = false;
  let typingStartedAt = 0;
  const appearance = new Compartment();
  const spellcheck = new Compartment();
  const activeLineHighlight = new Compartment();
  const state = EditorState.create({
    doc: options.doc,
    selection: {
      anchor: Math.min(options.initialCursor ?? 0, options.doc.length),
    },
    extensions: [
      markdown(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      history(),
      closeBrackets(),
      autocompletion({
        override: [wikilinkCompletion(options.searchNotes)],
        activateOnTyping: true,
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        indentWithTab,
      ]),
      activeLineHighlight.of(
        options.highlightActiveLine ? highlightActiveLine() : [],
      ),
      flashHighlight,
      EditorView.lineWrapping,
      placeholder("Start writing…"),
      livePreview({
        sourcePath: options.sourcePath,
        openWikilink: options.openWikilink,
        openPdf: options.openPdf,
        openExternal: options.openExternal,
        selectTag: options.selectTag,
        imageUrl: options.imageUrl,
      }),
      EditorView.domEventHandlers({
        paste(event) {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || !options.importPastedFiles) return false;
          event.preventDefault();
          options.importPastedFiles(files);
          return true;
        },
        keydown(event) {
          if (
            event.key.length === 1 ||
            ["Backspace", "Delete", "Enter"].includes(event.key)
          ) {
            typingStartedAt = performance.now();
          }
          return false;
        },
        click(event, view) {
          if (!(event.metaKey || event.ctrlKey)) return false;
          const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });
          if (position === null) return false;
          const line = view.state.doc.lineAt(position);
          const target = wikilinkAt(line.text, position - line.from);
          if (target) {
            event.preventDefault();
            options.openWikilink(target, true);
            return true;
          }
          const external = externalUrlAt(view.state, position);
          if (external) {
            event.preventDefault();
            options.openExternal(external);
            return true;
          }
          return false;
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !applyingExternalDocument) {
          options.onChange(update.state.doc.toString());
          if (typingStartedAt) {
            recordTypingLatency(performance.now() - typingStartedAt);
            typingStartedAt = 0;
          }
        }
        if (update.selectionSet || update.docChanged) {
          options.onPosition?.(
            update.state.selection.main.head,
            update.view.scrollDOM.scrollTop,
          );
        }
      }),
      appearance.of(
        editorTheme(
          options.fontSize,
          options.font,
          options.lineWidth,
          options.readableLineLength,
        ),
      ),
      spellcheck.of(spellcheckExtension(options.spellcheck)),
    ],
  });
  const view = new EditorView({ state, parent: options.parent });
  view.scrollDOM.scrollTop = options.initialScrollTop ?? 0;
  view.scrollDOM.addEventListener("scroll", () => {
    options.onPosition?.(
      view.state.selection.main.head,
      view.scrollDOM.scrollTop,
    );
  });
  return {
    view,
    setDocument(content: string): void {
      if (content === view.state.doc.toString()) return;
      applyingExternalDocument = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: { anchor: 0 },
      });
      applyingExternalDocument = false;
    },
    insert(text: string): void {
      const selection = view.state.selection.main;
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length },
        scrollIntoView: true,
      });
      view.focus();
    },
    updateSettings(settings): void {
      view.dispatch({
        effects: [
          appearance.reconfigure(
            editorTheme(
              settings.fontSize,
              settings.font,
              settings.lineWidth,
              settings.readableLineLength,
            ),
          ),
          spellcheck.reconfigure(spellcheckExtension(settings.spellcheck)),
          activeLineHighlight.reconfigure(
            settings.highlightActiveLine ? highlightActiveLine() : [],
          ),
        ],
      });
    },
    jumpToLine(line: number, start?: number, end?: number): void {
      const boundedLine = Math.max(1, Math.min(line, view.state.doc.lines));
      const documentLine = view.state.doc.line(boundedLine);
      const from = Math.max(
        documentLine.from,
        Math.min(start ?? documentLine.from, view.state.doc.length),
      );
      const to = Math.max(
        from,
        Math.min(end ?? documentLine.to, view.state.doc.length),
      );
      view.dispatch({
        selection: { anchor: from },
        effects: [
          setFlash.of({ from, to }),
          EditorView.scrollIntoView(from, { y: "center" }),
        ],
      });
      view.focus();
      window.setTimeout(() => {
        view.dispatch({ effects: setFlash.of(null) });
      }, 1200);
    },
    destroy(): void {
      view.destroy();
    },
  };
}
