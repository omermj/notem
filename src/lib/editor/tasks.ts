export interface TaskMarkerRange {
  from: number;
  to: number;
}

export function taskMarkerRange(text: string): TaskMarkerRange | null {
  const match = /^(\s*(?:>\s*)?)([-+*])(\s+)(?=\[(?: |x|X)\](?:\s|$))/.exec(
    text,
  );
  if (!match) return null;
  return {
    from: match[1].length,
    to: match[1].length + match[2].length + match[3].length,
  };
}
