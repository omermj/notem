import { vaultState } from "./vault.svelte";
import { SvelteDate } from "svelte/reactivity";
import type { UpdateCheckPreference } from "../api";
import { settingsState, updateSettings } from "./settings.svelte";
import { nativeUpdaterClient } from "../updater/client";
import { normalizeVersion, userFacingUpdateError } from "../updater/types";
import { automaticCheckIsDue } from "../updater/policy";
import type {
  UpdateCheckResult,
  UpdateCheckSource,
  UpdateInstallationCapability,
  UpdaterClient,
  UpdaterState,
  UpdaterStore,
  UpdaterUpdate,
} from "../updater/types";

export interface UpdaterStoreOptions {
  client?: UpdaterClient;
  now?: () => string;
  getUpdateCheckPreference?: () => UpdateCheckPreference;
  getLastAutomaticUpdateAttemptAt?: () => string | null;
  getDismissedUpdateVersion?: () => string | null;
  persistSettings?: (patch: {
    lastAutomaticUpdateAttemptAt?: string | null;
    lastSuccessfulUpdateCheckAt?: string | null;
    dismissedUpdateVersion?: string | null;
  }) => Promise<void>;
  prepareForInstallation?: () => Promise<void>;
}

const initialState = (): UpdaterState => ({
  status: "idle",
  installedVersion: null,
  installationCapability: null,
  checkSource: null,
  error: null,
  errorSource: null,
  availableVersion: null,
  releaseNotes: null,
  releaseDate: null,
  progress: null,
});

function defaultPersistSettings(
  patch: Parameters<NonNullable<UpdaterStoreOptions["persistSettings"]>>[0],
): Promise<void> {
  return updateSettings(patch, {
    notifyOnError: false,
    throwOnError: true,
  });
}

export function createUpdaterStore(
  options: UpdaterStoreOptions = {},
): UpdaterStore {
  const client = options.client ?? nativeUpdaterClient;
  const now = options.now ?? (() => new SvelteDate().toISOString());
  const getUpdateCheckPreference =
    options.getUpdateCheckPreference ??
    (() => settingsState.updateCheckPreference);
  const getLastAutomaticUpdateAttemptAt =
    options.getLastAutomaticUpdateAttemptAt ??
    (() => settingsState.lastAutomaticUpdateAttemptAt);
  const getDismissedUpdateVersion =
    options.getDismissedUpdateVersion ??
    (() => settingsState.dismissedUpdateVersion);
  const persistSettings = options.persistSettings ?? defaultPersistSettings;
  const prepareForInstallation =
    options.prepareForInstallation ?? (() => vaultState.saveAll());
  const state = $state<UpdaterState>(initialState());
  let activeUpdate: UpdaterUpdate | null = null;
  let checkPromise: Promise<UpdateCheckResult> | null = null;
  let versionPromise: Promise<string> | null = null;
  let capabilityPromise: Promise<UpdateInstallationCapability> | null = null;
  let installationPromise: Promise<void> | null = null;
  let automaticAttemptRecordedAt: string | null | undefined;
  let dismissedUpdateVersionRecorded: string | null | undefined;

  async function closeActiveUpdate(): Promise<void> {
    const update = activeUpdate;
    activeUpdate = null;
    if (!update) return;
    try {
      await update.close();
    } catch {
      // A failed close must not retain a stale native update resource.
    }
  }

  async function loadInstalledVersion(): Promise<string> {
    if (state.installedVersion !== null) return state.installedVersion;
    if (versionPromise) return versionPromise;
    const pending = client
      .getInstalledVersion()
      .then((version) => {
        state.installedVersion = version;
        return version;
      })
      .finally(() => {
        if (versionPromise === pending) versionPromise = null;
      });
    versionPromise = pending;
    return pending;
  }

  async function loadInstallationCapability(): Promise<UpdateInstallationCapability> {
    if (state.installationCapability) return state.installationCapability;
    if (capabilityPromise) return capabilityPromise;
    const pending = client
      .getInstallationCapability()
      .then((capability) => {
        state.installationCapability = capability;
        return capability;
      })
      .finally(() => {
        if (capabilityPromise === pending) capabilityPromise = null;
      });
    capabilityPromise = pending;
    return pending;
  }

  function updateAvailableState(update: UpdaterUpdate, version: string): void {
    activeUpdate = update;
    state.status = "available";
    state.availableVersion = version;
    state.releaseNotes = update.notes;
    state.releaseDate = update.date;
    state.progress = null;
    state.error = null;
    state.errorSource = null;
  }

  async function checkForUpdate(
    source: UpdateCheckSource,
  ): Promise<UpdateCheckResult> {
    if (checkPromise) return checkPromise;
    if (installationPromise) {
      return {
        started: false,
        source,
        status: "error",
        error: "An update installation is already in progress",
      };
    }
    if (
      source === "background" &&
      !automaticCheckIsDue(
        getUpdateCheckPreference(),
        automaticAttemptRecordedAt ?? getLastAutomaticUpdateAttemptAt(),
        safeNow(),
      )
    ) {
      return { started: false, source, status: "skipped", error: null };
    }

    const pending = performCheck(source).finally(() => {
      if (checkPromise === pending) checkPromise = null;
    });
    checkPromise = pending;
    return pending;
  }

  async function performCheck(
    source: UpdateCheckSource,
  ): Promise<UpdateCheckResult> {
    state.status = "checking";
    state.checkSource = source;
    state.error = null;
    state.errorSource = null;
    state.progress = null;

    try {
      if (source === "background") {
        // Record the attempt before touching the network. If this fails, the
        // check is aborted so offline launches cannot repeatedly hammer GitHub.
        const attemptAt = safeNow();
        await persistSettings({ lastAutomaticUpdateAttemptAt: attemptAt });
        automaticAttemptRecordedAt = attemptAt;
      }
      await closeActiveUpdate();
      const update = await client.checkForUpdate();

      if (!update) {
        await persistBestEffort({ lastSuccessfulUpdateCheckAt: safeNow() });
        state.status = "upToDate";
        state.availableVersion = null;
        state.releaseNotes = null;
        state.releaseDate = null;
        return { started: true, source, status: "upToDate", error: null };
      }

      activeUpdate = update;

      const version = normalizeVersion(update.version);
      if (!version) throw new Error("The updater returned an invalid version");

      if (version === stateDismissedVersion()) {
        await closeActiveUpdate();
        await persistBestEffort({ lastSuccessfulUpdateCheckAt: safeNow() });
        state.status = "upToDate";
        state.availableVersion = null;
        state.releaseNotes = null;
        state.releaseDate = null;
        return { started: true, source, status: "upToDate", error: null };
      }

      await loadInstallationCapability();
      updateAvailableState(update, version);
      await persistBestEffort({ lastSuccessfulUpdateCheckAt: safeNow() });
      return { started: true, source, status: "available", error: null };
    } catch (error) {
      state.status = "error";
      state.error = userFacingUpdateError(error, "check");
      state.errorSource = source;
      state.availableVersion = null;
      state.releaseNotes = null;
      state.releaseDate = null;
      state.progress = null;
      await closeActiveUpdate();
      return { started: true, source, status: "error", error: state.error };
    }
  }

  function safeNow(): string {
    const timestamp = now();
    return Number.isFinite(Date.parse(timestamp))
      ? timestamp
      : new SvelteDate().toISOString();
  }

  async function persistBestEffort(
    patch: Parameters<NonNullable<UpdaterStoreOptions["persistSettings"]>>[0],
  ): Promise<void> {
    try {
      await persistSettings(patch);
    } catch {
      // A successful network check remains useful even if metadata cannot be saved.
    }
  }

  function stateDismissedVersion(): string | null {
    // The settings store owns the persisted value; the store only compares
    // normalized release versions at the updater boundary.
    const dismissedVersion =
      dismissedUpdateVersionRecorded ?? getDismissedUpdateVersion();
    return dismissedVersion ? normalizeVersion(dismissedVersion) : null;
  }

  async function dismissAvailableUpdate(): Promise<void> {
    const version = state.availableVersion;
    await closeActiveUpdate();
    state.status = "idle";
    state.availableVersion = null;
    state.releaseNotes = null;
    state.releaseDate = null;
    state.progress = null;
    state.error = null;
    state.errorSource = null;
    if (version) {
      dismissedUpdateVersionRecorded = version;
      await persistBestEffort({ dismissedUpdateVersion: version });
    }
  }

  async function installAvailableUpdate(): Promise<void> {
    if (installationPromise) return installationPromise;
    const pending = performInstallation().finally(() => {
      if (installationPromise === pending) installationPromise = null;
    });
    installationPromise = pending;
    return pending;
  }

  async function performInstallation(): Promise<void> {
    const update = activeUpdate;
    const version = state.availableVersion;
    if (!update || !version || state.status !== "available") return;

    try {
      const capability = await loadInstallationCapability();
      if (capability.mode !== "automatic") {
        state.status = "manualDownloadRequired";
        await closeActiveUpdate();
        await client.openReleasePage(version);
        return;
      }

      state.status = "installing";
      await prepareForInstallation();
      state.status = "downloading";
      state.progress = { downloadedBytes: 0, totalBytes: null };
      await update.downloadAndInstall((event) => {
        if (event.type === "started") {
          state.progress = {
            downloadedBytes: 0,
            totalBytes: event.totalBytes,
          };
        } else if (event.type === "progress") {
          state.progress = {
            downloadedBytes:
              (state.progress?.downloadedBytes ?? 0) + event.chunkBytes,
            totalBytes: state.progress?.totalBytes ?? null,
          };
        } else {
          state.status = "installing";
        }
      });
      state.status = "installing";
      await closeActiveUpdate();
      state.availableVersion = null;
      state.releaseNotes = null;
      state.releaseDate = null;
      if (capability.relaunchAfterInstall !== false) {
        await client.relaunch();
      }
    } catch (error) {
      state.status = "error";
      state.error = userFacingUpdateError(error, "install");
      state.errorSource = null;
      state.progress = null;
      state.availableVersion = null;
      state.releaseNotes = null;
      state.releaseDate = null;
      await closeActiveUpdate();
    }
  }

  async function openReleasePage(): Promise<void> {
    const version = state.availableVersion;
    if (!version) return;
    try {
      await client.openReleasePage(version);
    } catch (error) {
      state.status = "error";
      state.error = userFacingUpdateError(error, "open");
      state.errorSource = null;
    }
  }

  const store: UpdaterStore = {
    state,
    loadInstalledVersion,
    loadInstallationCapability,
    checkForUpdate,
    checkForUpdateManually: () => checkForUpdate("manual"),
    checkForUpdateInBackground: () => checkForUpdate("background"),
    dismissAvailableUpdate,
    installAvailableUpdate,
    openReleasePage,
  };
  return store;
}

export const updaterStore = createUpdaterStore();
export const updaterState = updaterStore.state;
export const loadInstalledVersion = updaterStore.loadInstalledVersion;
export const loadInstallationCapability =
  updaterStore.loadInstallationCapability;
export const checkForUpdate = updaterStore.checkForUpdate;
export const checkForUpdateManually = updaterStore.checkForUpdateManually;
export const checkForUpdateInBackground =
  updaterStore.checkForUpdateInBackground;
export const dismissAvailableUpdate = updaterStore.dismissAvailableUpdate;
export const installAvailableUpdate = updaterStore.installAvailableUpdate;
export const openReleasePage = updaterStore.openReleasePage;
