import { describe, expect, it } from "vitest";
import { taskMarkerRange } from "./tasks";

describe("taskMarkerRange", () => {
  it("finds task-list bullets while preserving indentation", () => {
    expect(taskMarkerRange("  - [ ] Nested task")).toEqual({
      from: 2,
      to: 4,
    });
    expect(taskMarkerRange("> * [x] Quoted task")).toEqual({
      from: 2,
      to: 4,
    });
  });

  it("leaves ordinary list markers visible", () => {
    expect(taskMarkerRange("- Ordinary item")).toBeNull();
    expect(taskMarkerRange("Use [ ] in prose")).toBeNull();
  });
});
