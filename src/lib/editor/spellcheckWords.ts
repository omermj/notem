export interface TextRange {
  from: number;
  to: number;
}

export interface WordRange extends TextRange {
  word: string;
}

const wordPattern = /\p{L}+(?:['’]\p{L}+)?/gu;

function likelyIdentifier(word: string): boolean {
  return (
    /^[A-Z]{2,}$/.test(word) ||
    /[a-z][A-Z]|[A-Z].*[A-Z]/.test(word) ||
    word.length > 48
  );
}

function likelyProperNoun(text: string, from: number, word: string): boolean {
  if (!/^\p{Lu}\p{Ll}+$/u.test(word)) return false;
  const before = text.slice(0, from).match(/\S(?=\s*$)/u)?.[0];
  return Boolean(before && !/[.!?:\n]/.test(before));
}

export function wordsToCheck(
  text: string,
  excludedRanges: readonly TextRange[],
): WordRange[] {
  const excluded = [...excludedRanges].sort((a, b) => a.from - b.from);
  const words: WordRange[] = [];
  let excludedIndex = 0;

  for (const match of text.matchAll(wordPattern)) {
    const from = match.index;
    const to = from + match[0].length;
    while (
      excludedIndex < excluded.length &&
      excluded[excludedIndex].to <= from
    ) {
      excludedIndex += 1;
    }
    const range = excluded[excludedIndex];
    if (
      (range && range.from < to && range.to > from) ||
      likelyIdentifier(match[0]) ||
      likelyProperNoun(text, from, match[0])
    ) {
      continue;
    }
    words.push({ from, to, word: match[0] });
  }

  return words;
}
