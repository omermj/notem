<script lang="ts">
  import { uiState } from "../stores/ui.svelte";

  const timings = $derived(uiState.debugTimings);
  const rows = $derived(
    timings
      ? [
          [
            "Frontend ready",
            timings.frontendReadyMs,
            1000,
            timings.coldStartTargetMet,
          ],
          [
            `Index (${timings.indexedFiles} files)`,
            timings.indexMs,
            3000,
            timings.indexTargetMet,
          ],
          ["Search", timings.searchMs, 100, timings.searchTargetMet],
          ["Typing max", timings.typingMaxMs, 16, timings.typingTargetMet],
          [
            "Typing average",
            timings.typingAverageMs,
            16,
            timings.typingAverageMs < 16,
          ],
        ]
      : [],
  );
</script>

{#if timings}
  <div class="modal-backdrop">
    <div
      class="confirm-modal debug-timings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Performance timings"
    >
      <h2>Performance timings</h2>
      <p>Live measurements from this session against NoteM’s target budgets.</p>
      <table>
        <thead
          ><tr><th>Metric</th><th>Measured</th><th>Target</th><th></th></tr
          ></thead
        >
        <tbody>
          {#each rows as row (row[0])}
            <tr>
              <td>{row[0]}</td>
              <td>{Number(row[1]).toFixed(1)} ms</td>
              <td>&lt; {row[2]} ms</td>
              <td class:metric-pass={Boolean(row[3])}
                >{row[3] ? "Pass" : "Over"}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="modal-actions">
        <button type="button" onclick={() => (uiState.debugTimings = null)}
          >Close</button
        >
      </div>
    </div>
  </div>
{/if}
