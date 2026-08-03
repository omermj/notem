<script lang="ts">
  import SettingToggle from "./SettingToggle.svelte";
  import {
    checkForUpdateManually,
    checkForUpdateInBackground,
    dismissAvailableUpdate,
    installAvailableUpdate,
    loadInstalledVersion,
    openReleasePage,
    updaterState,
  } from "../stores/updater.svelte";
  import { releaseNotesSummary, updatePreferenceLabel } from "../updater/types";
  import { settingsState, updateSettings } from "../stores/settings.svelte";

  let versionLoadFailed = $state(false);
  let manualCheckPending = $state(false);
  const aboutVersion = $derived(
    versionLoadFailed
      ? "Unavailable"
      : (updaterState.installedVersion ?? "Loading…"),
  );
  const preferenceLabel = $derived(
    updatePreferenceLabel(settingsState.updateCheckPreference),
  );
  const available = $derived(
    updaterState.availableVersion !== null &&
      (updaterState.status === "available" ||
        updaterState.status === "manualDownloadRequired" ||
        updaterState.status === "downloading" ||
        updaterState.status === "installing" ||
        updaterState.status === "restartRequired"),
  );
  const busy = $derived(
    manualCheckPending ||
      updaterState.status === "checking" ||
      updaterState.status === "downloading" ||
      updaterState.status === "installing",
  );
  const visibleError = $derived(
    updaterState.error !== null &&
      (updaterState.errorSource === "manual" ||
        updaterState.errorSource === null)
      ? updaterState.error
      : null,
  );
  const notes = $derived(releaseNotesSummary(updaterState.releaseNotes, 720));

  $effect(() => {
    if (updaterState.installedVersion !== null || versionLoadFailed) return;
    void loadInstalledVersion().catch(() => {
      versionLoadFailed = true;
    });
  });

  function formatTimestamp(value: string | null): string {
    if (!value) return "Not yet";
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp > Date.now())
      return "Not recorded";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }

  function formatBytes(value: number): string {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function statusLabel(): string {
    if (updaterState.status === "error") {
      return updaterState.errorSource === "background"
        ? "Automatic check unavailable"
        : updaterState.errorSource === "manual"
          ? "Update check failed"
          : "Update action failed";
    }
    switch (updaterState.status) {
      case "checking":
        return "Checking for updates";
      case "upToDate":
        return updaterState.checkSource === "manual" ? "Up to date" : "Checked";
      case "available":
        return "Update available";
      case "downloading":
        return "Downloading update";
      case "installing":
        return "Installing update";
      case "manualDownloadRequired":
        return "Download from GitHub";
      case "restartRequired":
        return "Restart NoteM manually";
      default:
        return "Not checked yet";
    }
  }

  async function checkManually(): Promise<void> {
    if (manualCheckPending) return;
    manualCheckPending = true;
    try {
      await checkForUpdateManually();
    } finally {
      manualCheckPending = false;
    }
  }

  async function setAutomatic(enabled: boolean): Promise<void> {
    await updateSettings({
      updateCheckPreference: enabled ? "automatic" : "manual",
    });
    if (enabled) void checkForUpdateInBackground();
  }
</script>

<div class="setting-group updater-about-group">
  <h3>Updates</h3>
  <div class="setting-row">
    <div>
      <strong>Installed version</strong>
      <small>Loaded from the installed application</small>
    </div>
    <span class="update-about-value">{aboutVersion}</span>
  </div>
  <div class="setting-row">
    <div>
      <strong>Update checks</strong>
      <small>{preferenceLabel}</small>
    </div>
    <SettingToggle
      label="Enable automatic update checks"
      checked={settingsState.updateCheckPreference === "automatic"}
      onchange={(checked) => void setAutomatic(checked)}
    />
  </div>
  <div class="setting-row">
    <div>
      <strong>Last successful check</strong>
      <small>Background checks run at most once per rolling 24 hours.</small>
    </div>
    <span class="update-about-value"
      >{formatTimestamp(settingsState.lastSuccessfulUpdateCheckAt)}</span
    >
  </div>
  <div class="setting-row">
    <div>
      <strong>Updater status</strong>
      <small>{statusLabel()}</small>
    </div>
    <button
      class="setting-action"
      type="button"
      disabled={busy}
      onclick={() => void checkManually()}
    >
      {updaterState.status === "checking" || manualCheckPending
        ? "Checking…"
        : "Check for updates"}
    </button>
  </div>
</div>

{#if visibleError}
  <p class="update-about-error" role="alert">{visibleError}</p>
{/if}

{#if updaterState.status === "upToDate" && updaterState.checkSource === "manual"}
  <p class="update-about-success" role="status">NoteM is up to date.</p>
{/if}

{#if available}
  <div class="setting-group updater-available-group" aria-live="polite">
    <h3>Available update</h3>
    <div class="update-about-release">
      <strong>NoteM {updaterState.availableVersion}</strong>
      {#if notes}<p>{notes}</p>{/if}
    </div>
    {#if updaterState.progress}
      <div class="update-progress" aria-live="polite">
        {#if updaterState.progress.totalBytes !== null}
          <progress
            value={updaterState.progress.downloadedBytes}
            max={Math.max(updaterState.progress.totalBytes, 1)}
            aria-label="Update download progress"
          ></progress>
          <span>
            {formatBytes(updaterState.progress.downloadedBytes)} /
            {formatBytes(updaterState.progress.totalBytes)}
          </span>
        {:else}
          <progress aria-label="Update download progress"></progress>
          <span
            >Downloading… {formatBytes(
              updaterState.progress.downloadedBytes,
            )}</span
          >
        {/if}
      </div>
    {/if}
    {#if updaterState.status === "available"}
      <p class="update-about-warning">
        Installing may close or restart NoteM. NoteM will save pending note
        changes first and will stop if they cannot be saved safely.
      </p>
    {:else if updaterState.status === "manualDownloadRequired"}
      <p class="update-about-hint">
        This installation will use the fixed GitHub release page for
        downloading.
      </p>
    {:else if updaterState.status === "restartRequired"}
      <p class="update-about-warning">
        The update was installed. Restart NoteM manually to finish.
      </p>
    {:else}
      <p class="update-about-warning">
        NoteM may close or restart when the installation finishes.
      </p>
    {/if}
    <div class="update-about-actions">
      {#if updaterState.status === "available"}
        <button
          class="primary-button"
          type="button"
          disabled={busy}
          onclick={() => void installAvailableUpdate()}
        >
          {updaterState.installationCapability?.mode === "manualDownloadOnly"
            ? "Download update"
            : "Install update"}
        </button>
      {/if}
      <button
        type="button"
        disabled={busy}
        onclick={() => void openReleasePage()}>View release notes</button
      >
      <button
        type="button"
        disabled={busy}
        onclick={() => void dismissAvailableUpdate()}>Later</button
      >
    </div>
  </div>
{/if}
