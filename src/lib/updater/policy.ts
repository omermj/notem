import type { UpdateCheckPreference } from "../api";

export const AUTOMATIC_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type AutomaticCheckPolicy = "due" | "throttled" | "resetFuture";

function timestampMilliseconds(value: string | null): number | null {
  if (!value) return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    !daysInMonth ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 60 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function automaticCheckIsDue(
  preference: UpdateCheckPreference,
  lastAttemptAt: string | null,
  now: string,
): boolean {
  return automaticCheckPolicy(preference, lastAttemptAt, now) === "due";
}

export function automaticCheckPolicy(
  preference: UpdateCheckPreference,
  lastAttemptAt: string | null,
  now: string,
): AutomaticCheckPolicy {
  if (preference !== "automatic") return "throttled";

  const nowMs = timestampMilliseconds(now);
  if (nowMs === null) return "throttled";

  const lastAttemptMs = timestampMilliseconds(lastAttemptAt);
  if (lastAttemptMs === null) return "due";
  if (lastAttemptMs > nowMs) return "resetFuture";

  return nowMs - lastAttemptMs >= AUTOMATIC_CHECK_INTERVAL_MS
    ? "due"
    : "throttled";
}

export type UpdaterStartupAction = "consent" | "backgroundCheck" | "none";

export function updaterStartupAction(
  preference: UpdateCheckPreference,
  lastAttemptAt: string | null,
  now: string,
): UpdaterStartupAction {
  if (preference === "unset") return "consent";
  return preference === "automatic" &&
    automaticCheckPolicy(preference, lastAttemptAt, now) !== "throttled"
    ? "backgroundCheck"
    : "none";
}
