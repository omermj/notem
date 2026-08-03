<script lang="ts">
  import { tick } from "svelte";
  import { updateSettings, settingsState } from "../stores/settings.svelte";
  import { updaterStore } from "../stores/updater.svelte";

  let { visible }: { visible: boolean } = $props();
  let automaticButton = $state<HTMLButtonElement | undefined>(undefined);
  let saving = $state(false);
  const shown = $derived(
    visible && settingsState.updateCheckPreference === "unset",
  );

  $effect(() => {
    if (!shown) return;
    void tick().then(() => automaticButton?.focus());
  });

  async function choose(preference: "automatic" | "manual"): Promise<void> {
    if (saving) return;
    saving = true;
    try {
      await updateSettings({ updateCheckPreference: preference });
      if (preference === "automatic") {
        // This is the first point at which a network request is permitted.
        void updaterStore.checkForUpdateInBackground();
      }
    } finally {
      saving = false;
    }
  }
</script>

{#if shown}
  <div
    class="update-consent"
    role="dialog"
    aria-labelledby="update-consent-title"
    aria-describedby="update-consent-description"
    tabindex="-1"
    onkeydown={(event) => {
      if (event.key === "Escape") void choose("manual");
    }}
  >
    <h2 id="update-consent-title">Choose how NoteM checks for updates</h2>
    <div id="update-consent-description">
      <p>NoteM can periodically contact GitHub to check for releases.</p>
      <p>
        NoteM does not send notes, vault paths, settings, usage data,
        identifiers, or telemetry. GitHub receives the normal network
        information associated with the request.
      </p>
      <p>You can keep update checking manual.</p>
    </div>
    <div class="update-consent-actions">
      <button
        class="primary-button"
        type="button"
        bind:this={automaticButton}
        disabled={saving}
        onclick={() => void choose("automatic")}
      >
        Enable automatic update checks
      </button>
      <button
        type="button"
        disabled={saving}
        onclick={() => void choose("manual")}
      >
        Check manually only
      </button>
    </div>
  </div>
{/if}
