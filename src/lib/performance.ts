const typingSamples: number[] = [];

export function recordTypingLatency(milliseconds: number): void {
  typingSamples.push(milliseconds);
  if (typingSamples.length > 120) typingSamples.shift();
}

export function typingTimings(): { average: number; max: number } {
  if (!typingSamples.length) return { average: 0, max: 0 };
  return {
    average:
      typingSamples.reduce((total, sample) => total + sample, 0) /
      typingSamples.length,
    max: Math.max(...typingSamples),
  };
}
