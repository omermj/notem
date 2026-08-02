import { describe, expect, it } from "vitest";
import { normalizeVersion, releasePageUrl } from "./types";

describe("updater version helpers", () => {
  it("normalizes supported release versions", () => {
    expect(normalizeVersion(" v1.2.3 ")).toBe("1.2.3");
    expect(normalizeVersion("1.2.3-beta.1+build.7")).toBe(
      "1.2.3-beta.1+build.7",
    );
  });

  it("rejects unsafe release tags", () => {
    expect(normalizeVersion("../../settings")).toBeNull();
    expect(normalizeVersion("1.2")).toBeNull();
    expect(releasePageUrl("1.2.3#notes")).toBeNull();
  });

  it("constructs a fixed NoteM release tag URL", () => {
    expect(releasePageUrl("v1.2.3")).toBe(
      "https://github.com/omermj/notem/releases/tag/v1.2.3",
    );
  });
});
