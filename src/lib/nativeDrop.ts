export interface NativeDropPosition {
  x: number;
  y: number;
}

export function nativeDropClientPosition(
  position: NativeDropPosition,
  scaleFactor: number,
  userAgent = navigator.userAgent,
): NativeDropPosition {
  const scale =
    Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const windows = /\bWindows\b/i.test(userAgent);
  return windows ? { x: position.x / scale, y: position.y / scale } : position;
}
