<script lang="ts">
  import { errorMessage } from "../api";
  import { showToast } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";

  const conflict = $derived(vaultState.conflict);
  const mineLines = $derived(conflict?.mine.split("\n") ?? []);
  const diskLines = $derived(conflict?.disk.split("\n") ?? []);
  const changedLines = $derived(
    Math.max(mineLines.length, diskLines.length) -
      mineLines.filter((line, index) => diskLines[index] === line).length,
  );

  async function choose(choice: "mine" | "disk"): Promise<void> {
    try {
      await vaultState.resolveConflict(choice);
      showToast(
        choice === "mine"
          ? "Kept your version and replaced the disk copy."
          : "Loaded the version currently on disk.",
        "info",
      );
    } catch (error) {
      showToast(errorMessage(error));
    }
  }
</script>

{#if conflict}
  <div class="modal-backdrop">
    <div
      class="conflict-modal"
      role="alertdialog"
      aria-modal="true"
      aria-label="External edit conflict"
    >
      <header>
        <div>
          <h2>External edit conflict</h2>
          <p>
            {conflict.path} changed on disk while you were editing it. Approximately
            {changedLines} lines differ.
          </p>
        </div>
      </header>
      <div class="conflict-comparison">
        <article>
          <strong>Your version</strong>
          <pre>{conflict.mine.slice(0, 4000)}</pre>
        </article>
        <article>
          <strong>Disk version</strong>
          <pre>{conflict.disk.slice(0, 4000)}</pre>
        </article>
      </div>
      <footer class="modal-actions">
        <button type="button" onclick={() => choose("disk")}>Take disk</button>
        <button
          class="primary-button"
          type="button"
          onclick={() => choose("mine")}>Keep mine</button
        >
      </footer>
    </div>
  </div>
{/if}
