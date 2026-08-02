import { describe, expect, it } from "vitest";
import { automaticCheckIsDue, updaterStartupAction } from "./policy";

const now = "2026-08-02T12:00:00.000Z";

describe("updater startup policy", () => {
  it("shows consent without contacting the network for an unset preference", () => {
    expect(updaterStartupAction("unset", null, now)).toBe("consent");
    expect(automaticCheckIsDue("unset", null, now)).toBe(false);
  });

  it("runs automatic checks only when the preference is automatic", () => {
    expect(updaterStartupAction("automatic", null, now)).toBe(
      "backgroundCheck",
    );
    expect(updaterStartupAction("manual", null, now)).toBe("none");
  });

  it("uses a rolling 24-hour window", () => {
    expect(
      automaticCheckIsDue("automatic", "2026-08-01T12:00:00.001Z", now),
    ).toBe(false);
    expect(
      automaticCheckIsDue("automatic", "2026-08-01T12:00:00.000Z", now),
    ).toBe(true);
  });

  it("safely ignores invalid and future timestamps", () => {
    expect(
      automaticCheckIsDue("automatic", "2026-02-31T12:00:00.000Z", now),
    ).toBe(true);
    expect(
      automaticCheckIsDue("automatic", "2026-08-03T12:00:00.000Z", now),
    ).toBe(true);
  });
});
