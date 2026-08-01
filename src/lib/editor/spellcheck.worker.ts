/// <reference lib="webworker" />

import nspell from "nspell";
import type NSpell from "nspell";
import type {
  Misspelling,
  SpellcheckRequest,
  SpellcheckResponse,
} from "./spellcheckProtocol";
import { wordsToCheck } from "./spellcheckWords";

let checkerPromise: Promise<NSpell> | null = null;
const resultCache = new Map<string, string[] | null>();

async function loadChecker(affUrl: string, dicUrl: string): Promise<NSpell> {
  const [affResponse, dicResponse] = await Promise.all([
    fetch(affUrl),
    fetch(dicUrl),
  ]);
  if (!affResponse.ok || !dicResponse.ok) {
    throw new Error("English dictionary could not be loaded");
  }
  const [aff, dic] = await Promise.all([
    affResponse.text(),
    dicResponse.text(),
  ]);
  return nspell(aff, dic);
}

function preserveCase(word: string, suggestion: string): string {
  if (/^\p{Lu}/u.test(word)) {
    return suggestion[0]?.toUpperCase() + suggestion.slice(1);
  }
  return suggestion;
}

async function check(request: SpellcheckRequest): Promise<Misspelling[]> {
  checkerPromise ??= loadChecker(request.affUrl, request.dicUrl);
  const checker = await checkerPromise;
  const misspellings: Misspelling[] = [];

  for (const candidate of wordsToCheck(request.text, request.excludedRanges)) {
    const normalized = candidate.word.replaceAll("’", "'");
    const cacheKey = normalized.toLocaleLowerCase("en");
    let suggestions = resultCache.get(cacheKey);
    if (suggestions === undefined) {
      suggestions = checker.correct(normalized)
        ? null
        : checker
            .suggest(normalized)
            .slice(0, 4)
            .map((suggestion) => preserveCase(candidate.word, suggestion));
      resultCache.set(cacheKey, suggestions);
    }
    if (suggestions) misspellings.push({ ...candidate, suggestions });
  }

  return misspellings;
}

self.addEventListener("message", (event: MessageEvent<SpellcheckRequest>) => {
  const request = event.data;
  void check(request)
    .then((misspellings) => {
      const response: SpellcheckResponse = { id: request.id, misspellings };
      self.postMessage(response);
    })
    .catch((error: unknown) => {
      checkerPromise = null;
      const response: SpellcheckResponse = {
        id: request.id,
        misspellings: [],
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    });
});
