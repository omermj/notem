import { describe, expect, it } from "vitest";
import { nativeDropClientPosition } from "./nativeDrop";

describe("nativeDropClientPosition", () => {
  it("keeps macOS Finder coordinates in logical webview points", () => {
    expect(
      nativeDropClientPosition(
        { x: 520, y: 300 },
        2,
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      ),
    ).toEqual({ x: 520, y: 300 });
  });

  it("keeps Linux GTK coordinates in logical webview points", () => {
    expect(
      nativeDropClientPosition(
        { x: 520, y: 300 },
        2,
        "Mozilla/5.0 (X11; Linux x86_64)",
      ),
    ).toEqual({ x: 520, y: 300 });
  });

  it("converts Windows physical client pixels to CSS pixels", () => {
    expect(
      nativeDropClientPosition(
        { x: 520, y: 300 },
        2,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      ),
    ).toEqual({ x: 260, y: 150 });
  });
});
