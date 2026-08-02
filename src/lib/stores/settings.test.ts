import { describe, expect, it } from "vitest";
import {
  normalizePersistedTimestamp,
  normalizeUpdateCheckPreference,
  settingsState,
} from "./settings.svelte";

describe("updater settings migration", () => {
  it("starts with an unset preference and empty updater metadata", () => {
    expect(settingsState.updateCheckPreference).toBe("unset");
    expect(settingsState.lastAutomaticUpdateAttemptAt).toBeNull();
    expect(settingsState.lastSuccessfulUpdateCheckAt).toBeNull();
    expect(settingsState.dismissedUpdateVersion).toBeNull();
  });

  it("normalizes unknown preferences and malformed timestamps", () => {
    expect(normalizeUpdateCheckPreference("sometimes")).toBe("unset");
    expect(normalizeUpdateCheckPreference("automatic")).toBe("automatic");
    expect(normalizePersistedTimestamp("not-a-timestamp")).toBeNull();
    expect(normalizePersistedTimestamp("2026-02-31T12:00:00.000Z")).toBeNull();
    expect(normalizePersistedTimestamp("2026-08-02T12:00:00.000Z")).toBe(
      "2026-08-02T12:00:00.000Z",
    );
  });
});
