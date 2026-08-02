import type {
  UpdateInstallationCapability,
  UpdateInstallationMode,
  UpdateCheckPreference,
} from "../api";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "manualDownloadRequired"
  | "error";

export type UpdateCheckSource = "manual" | "background";

export interface UpdateProgress {
  downloadedBytes: number;
  totalBytes: number | null;
}

export type UpdateDownloadEvent =
  | { type: "started"; totalBytes: number | null }
  | { type: "progress"; chunkBytes: number }
  | { type: "finished" };

export interface UpdaterUpdate {
  version: string;
  notes: string;
  date: string | null;
  downloadAndInstall(
    onEvent: (event: UpdateDownloadEvent) => void,
  ): Promise<void>;
  close(): Promise<void>;
}

export interface UpdaterClient {
  getInstalledVersion(): Promise<string>;
  checkForUpdate(): Promise<UpdaterUpdate | null>;
  getInstallationCapability(): Promise<UpdateInstallationCapability>;
  relaunch(): Promise<void>;
  openReleasePage(version: string): Promise<void>;
}

export interface UpdaterState {
  status: UpdateStatus;
  installedVersion: string | null;
  installationCapability: UpdateInstallationCapability | null;
  checkSource: UpdateCheckSource | null;
  error: string | null;
  errorSource: UpdateCheckSource | null;
  availableVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  progress: UpdateProgress | null;
}

export interface UpdateCheckResult {
  started: boolean;
  source: UpdateCheckSource;
  status: "skipped" | "upToDate" | "available" | "error";
  error: string | null;
}

export interface UpdaterStore {
  readonly state: UpdaterState;
  loadInstalledVersion(): Promise<string>;
  loadInstallationCapability(): Promise<UpdateInstallationCapability>;
  checkForUpdate(source: UpdateCheckSource): Promise<UpdateCheckResult>;
  checkForUpdateManually(): Promise<UpdateCheckResult>;
  checkForUpdateInBackground(): Promise<UpdateCheckResult>;
  dismissAvailableUpdate(): Promise<void>;
  installAvailableUpdate(): Promise<void>;
  openReleasePage(): Promise<void>;
}

export type { UpdateInstallationCapability, UpdateInstallationMode };

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function normalizeVersion(value: string): string | null {
  const trimmed = value.trim();
  const withoutPrefix = /^[vV]/.test(trimmed) ? trimmed.slice(1) : trimmed;
  return semverPattern.test(withoutPrefix) ? withoutPrefix : null;
}

export const RELEASE_PAGE_BASE_URL =
  "https://github.com/omermj/notem/releases/tag/";

export function releasePageUrl(version: string): string | null {
  const normalized = normalizeVersion(version);
  if (!normalized) return null;
  return `${RELEASE_PAGE_BASE_URL}v${encodeURIComponent(normalized)}`;
}

export function releaseNotesSummary(
  notes: string | null,
  maxLength = 320,
): string {
  if (!notes) return "";
  const compact = notes.trim().replace(/\s+/g, " ");
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function userFacingUpdateError(
  error: unknown,
  operation: "check" | "install" | "open" = "check",
): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const normalized = message.toLowerCase();

  if (
    operation === "install" &&
    /save|conflict|pending note/.test(normalized)
  ) {
    return "NoteM could not safely save your pending note changes, so the update was not installed.";
  }
  if (
    operation === "install" &&
    /signature|verify|verification|public key/.test(normalized)
  ) {
    return "The downloaded update could not be verified, so it was not installed.";
  }
  if (
    /network|offline|timeout|timed out|connect|dns|fetch|request/.test(
      normalized,
    )
  ) {
    return "Could not reach GitHub to check for updates. Check your internet connection and try again.";
  }
  if (
    /manifest|json|parse|invalid|malformed|version|deserialize|missing field|expected type/.test(
      normalized,
    )
  ) {
    return "GitHub returned release information that NoteM could not understand.";
  }
  if (operation === "open") {
    return "Could not open the GitHub release page. Check your default browser and try again.";
  }
  if (operation === "install") {
    return "NoteM could not install the update. Your current installation was not replaced.";
  }
  return "Could not check for updates right now. Try again later.";
}

export function updatePreferenceLabel(
  preference: UpdateCheckPreference,
): string {
  switch (preference) {
    case "automatic":
      return "Automatic checks enabled";
    case "manual":
      return "Manual checks only";
    case "unset":
      return "Not chosen yet";
  }
}
