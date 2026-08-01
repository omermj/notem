import { describe, expect, it } from "vitest";
import {
  fitGraphTransform,
  graphPreSettleTicks,
  MAX_GRAPH_ZOOM,
  MIN_GRAPH_ZOOM,
  wheelZoomFactor,
} from "./view";

describe("wheelZoomFactor", () => {
  it("normalizes pixel and line-based mouse wheels", () => {
    expect(wheelZoomFactor(100, 0, false)).toBeCloseTo(0.871, 3);
    expect(wheelZoomFactor(4, 1, false)).toBeCloseTo(0.871, 3);
  });

  it("makes trackpad pinch gestures more responsive", () => {
    expect(wheelZoomFactor(-5, 0, true)).toBeGreaterThan(
      wheelZoomFactor(-5, 0, false),
    );
  });

  it("bounds unusually large wheel events", () => {
    expect(wheelZoomFactor(-10_000, 0, false)).toBeCloseTo(Math.SQRT2);
    expect(wheelZoomFactor(10_000, 0, false)).toBeCloseTo(1 / Math.SQRT2);
  });
});

describe("fitGraphTransform", () => {
  it("centers and fits graph bounds inside the viewport", () => {
    const transform = fitGraphTransform(
      [
        { x: -200, y: -50, radius: 10 },
        { x: 200, y: 50, radius: 10 },
      ],
      1000,
      600,
      50,
    );
    expect(transform.x).toBe(500);
    expect(transform.y).toBe(300);
    expect(transform.zoom).toBeCloseTo(2.143, 2);
  });

  it("limits extreme fit scales", () => {
    expect(fitGraphTransform([{ x: 0, y: 0, radius: 1 }], 1000, 600).zoom).toBe(
      2.5,
    );
    expect(
      fitGraphTransform(
        [
          { x: -100_000, y: 0, radius: 1 },
          { x: 100_000, y: 0, radius: 1 },
        ],
        100,
        100,
      ).zoom,
    ).toBe(MIN_GRAPH_ZOOM);
    expect(MAX_GRAPH_ZOOM).toBeGreaterThan(2.5);
  });
});

describe("graphPreSettleTicks", () => {
  it("settles small graphs more fully without blocking on large vaults", () => {
    expect(graphPreSettleTicks(100, false)).toBe(72);
    expect(graphPreSettleTicks(1_000, false)).toBe(36);
    expect(graphPreSettleTicks(5_000, false)).toBe(8);
  });

  it("uses fewer passes when existing positions can be reused", () => {
    expect(graphPreSettleTicks(100, true)).toBe(12);
    expect(graphPreSettleTicks(5_000, true)).toBe(4);
  });
});
