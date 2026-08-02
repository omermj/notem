import type {
  UpdateInstallationCapability,
  UpdateInstallationMode,
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
  status: Exclude<
    UpdateStatus,
    | "idle"
    | "checking"
    | "downloading"
    | "installing"
    | "manualDownloadRequired"
  >;
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
