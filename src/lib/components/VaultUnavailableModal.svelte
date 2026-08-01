<script lang="ts">
  import { runCommand } from "../commands";
  import { uiState } from "../stores/ui.svelte";

  function chooseVault(): void {
    uiState.vaultUnavailable = false;
    runCommand("vault.open");
  }
</script>

{#if uiState.vaultUnavailable}
  <div class="modal-backdrop">
    <div
      class="confirm-modal"
      role="alertdialog"
      aria-modal="true"
      aria-label="Vault unavailable"
    >
      <h2>Vault unavailable</h2>
      <p>
        The vault’s drive or folder is no longer available. Reconnect the drive,
        then choose the vault again. Your notes have not been changed.
      </p>
      <div class="modal-actions">
        <button type="button" onclick={() => (uiState.vaultUnavailable = false)}
          >Dismiss</button
        >
        <button class="primary-button" type="button" onclick={chooseVault}
          >Choose vault…</button
        >
      </div>
    </div>
  </div>
{/if}
