import type { TextRange } from "./spellcheckWords";

export interface SpellcheckRequest {
  id: number;
  text: string;
  excludedRanges: TextRange[];
  affUrl: string;
  dicUrl: string;
}

export interface Misspelling {
  from: number;
  to: number;
  word: string;
  suggestions: string[];
}

export interface SpellcheckResponse {
  id: number;
  misspellings: Misspelling[];
  error?: string;
}
