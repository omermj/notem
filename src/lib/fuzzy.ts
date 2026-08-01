export function fuzzyScore(query: string, value: string): number | null {
  const needle = query.trim().toLowerCase();
  const haystack = value.toLowerCase();
  if (!needle) return 0;
  const exact = haystack.indexOf(needle);
  if (exact >= 0) return exact + haystack.length / 1000;
  let queryIndex = 0;
  let first = -1;
  let last = -1;
  for (let index = 0; index < haystack.length; index += 1) {
    if (haystack[index] !== needle[queryIndex]) continue;
    if (first < 0) first = index;
    last = index;
    queryIndex += 1;
    if (queryIndex === needle.length) {
      return 100 + (last - first) + first / 100;
    }
  }
  return null;
}
