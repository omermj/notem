import { describe, expect, it } from "vitest";
import {
  normalizeVersion,
  releaseNotesSummary,
  releasePageUrl,
  userFacingUpdateError,
} from "./types";

describe("updater version helpers", () => {
  it("normalizes supported release versions", () => {
    expect(normalizeVersion(" v1.2.3 ")).toBe("1.2.3");
  });

  it("rejects unsafe release tags", () => {
    expect(normalizeVersion("../../settings")).toBeNull();
    expect(normalizeVersion("1.2")).toBeNull();
    expect(normalizeVersion("1.2.3-beta.1")).toBeNull();
    expect(normalizeVersion("1.2.3+build.7")).toBeNull();
    expect(releasePageUrl("1.2.3#notes")).toBeNull();
  });

  it("constructs a fixed NoteM release tag URL", () => {
    expect(releasePageUrl("v1.2.3")).toBe(
      "https://github.com/omermj/notem/releases/tag/v1.2.3",
    );
  });

  it("keeps release notes as escaped plain text and shortens long notes", () => {
    expect(releaseNotesSummary("<b>Safe text</b>\nnext line")).toBe(
      "<b>Safe text</b> next line",
    );
    expect(releaseNotesSummary("0123456789", 6)).toBe("01234…");
  });

  it("maps internal failures to restrained user-facing messages", () => {
    expect(userFacingUpdateError(new Error("offline"))).toContain(
      "Could not reach GitHub",
    );
    expect(userFacingUpdateError(new Error("invalid manifest JSON"))).toContain(
      "could not understand",
    );
    expect(
      userFacingUpdateError(new Error("signature mismatch"), "install"),
    ).toContain("could not be verified");
  });
});
