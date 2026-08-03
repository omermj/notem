<script lang="ts">
  import {
    dismissAvailableUpdate,
    installAvailableUpdate,
    openReleasePage,
    updaterState,
  } from "../stores/updater.svelte";
  import { showToast } from "../stores/ui.svelte";
  import { releaseNotesSummary } from "../updater/types";

  const available = $derived(
    updaterState.status === "available" &&
      updaterState.availableVersion !== null,
  );
  const manualOnly = $derived(
    updaterState.installationCapability?.mode === "manualDownloadOnly",
  );
  const notes = $derived(releaseNotesSummary(updaterState.releaseNotes));
  const actionLabel = $derived(
    manualOnly ? "Download update" : "Install update",
  );

  async function installOrDownload(): Promise<void> {
    await installAvailableUpdate();
    if (updaterState.status === "error" && updaterState.error) {
      showToast(updaterState.error);
    }
  }

  async function viewReleaseNotes(): Promise<void> {
    await openReleasePage();
    if (updaterState.status === "error" && updaterState.error) {
      showToast(updaterState.error);
    }
  }
</script>

{#if available}
  <aside
    class="update-banner"
    role="region"
    aria-labelledby="update-banner-title"
    aria-live="polite"
  >
    <div class="update-banner-content">
      <h2 id="update-banner-title">
        NoteM {updaterState.availableVersion} is available
      </h2>
      {#if notes}<p class="update-banner-notes">{notes}</p>{/if}
      <p class="update-banner-hint">
        {manualOnly
          ? "Download opens the fixed GitHub release page for this installation."
          : "Installing may close or restart NoteM."}
      </p>
    </div>
    <div class="update-banner-actions">
      <button
        class="primary-button"
        type="button"
        onclick={() => void installOrDownload()}
      >
        {actionLabel}
      </button>
      <button type="button" onclick={() => void viewReleaseNotes()}
        >View release notes</button
      >
      <button type="button" onclick={() => void dismissAvailableUpdate()}
        >Later</button
      >
    </div>
  </aside>
{/if}
