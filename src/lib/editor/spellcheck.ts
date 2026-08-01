import { syntaxTree } from "@codemirror/language";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type {
  Misspelling,
  SpellcheckRequest,
  SpellcheckResponse,
} from "./spellcheckProtocol";
import type { TextRange } from "./spellcheckWords";

const excludedNodes = new Set([
  "Autolink",
  "CodeInfo",
  "CodeText",
  "Comment",
  "FencedCode",
  "HTMLBlock",
  "HTMLTag",
  "InlineCode",
  "URL",
]);

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<
  number,
  {
    resolve: (misspellings: Misspelling[]) => void;
    reject: (error: Error) => void;
  }
>();

function spellcheckWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./spellcheck.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener(
    "message",
    (event: MessageEvent<SpellcheckResponse>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.error) request.reject(new Error(response.error));
      else request.resolve(response.misspellings);
    },
  );
  worker.addEventListener("error", () => {
    for (const request of pending.values()) {
      request.reject(new Error("Spellcheck worker failed"));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function excludedRanges(view: EditorView): TextRange[] {
  const ranges: TextRange[] = [];
  syntaxTree(view.state).iterate({
    enter(node) {
      if (!excludedNodes.has(node.name)) return;
      ranges.push({ from: node.from, to: node.to });
      return false;
    },
  });
  return ranges;
}

function checkSpelling(view: EditorView): Promise<Misspelling[]> {
  const id = ++requestId;
  const baseUrl = new URL(".", document.baseURI);
  const request: SpellcheckRequest = {
    id,
    text: view.state.doc.toString(),
    excludedRanges: excludedRanges(view),
    affUrl: new URL("spellcheck/en.aff", baseUrl).href,
    dicUrl: new URL("spellcheck/en.dic", baseUrl).href,
  };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    spellcheckWorker().postMessage(request);
  });
}

function diagnostic(misspelling: Misspelling): Diagnostic {
  return {
    from: misspelling.from,
    to: misspelling.to,
    severity: "info",
    source: "Spelling",
    markClass: "cm-spelling-error",
    message: `“${misspelling.word}” may be misspelled`,
    actions: misspelling.suggestions.map((suggestion) => ({
      name: `Replace with “${suggestion}”`,
      apply(view, from, to) {
        view.dispatch({
          changes: { from, to, insert: suggestion },
          selection: { anchor: from + suggestion.length },
        });
        view.focus();
      },
    })),
  };
}

export function spellcheckExtension(enabled: boolean): Extension {
  const attributes = EditorView.contentAttributes.of({
    spellcheck: "false",
    autocorrect: "off",
  });
  if (!enabled) return attributes;
  return [
    attributes,
    linter(
      async (view) => {
        try {
          return (await checkSpelling(view)).map(diagnostic);
        } catch (error) {
          console.error("Spellcheck failed:", error);
          return [];
        }
      },
      { delay: 550 },
    ),
  ];
}
