<script lang="ts" module>
  function autofocus(node: HTMLInputElement): void {
    requestAnimationFrame(() => node.focus());
  }
</script>

<script lang="ts">
  import type { VaultEntry } from "../api";
  import { errorMessage } from "../api";
  import { moveDestinations } from "../fileActions";
  import { showToast } from "../stores/ui.svelte";
  import FileTreeIcon from "./FileTreeIcon.svelte";

  let {
    entry,
    tree,
    onMove,
    onClose,
  }: {
    entry: VaultEntry;
    tree: VaultEntry[];
    onMove: (destination: string) => Promise<void>;
    onClose: () => void;
  } = $props();

  let query = $state("");
  let selected = $state(0);
  let working = $state(false);
  const destinations = $derived(moveDestinations(tree, entry));
  const filtered = $derived(
    destinations.filter((destination) =>
      destination.label.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );

  $effect(() => {
    const firstAvailable = filtered.findIndex(
      (destination) => !destination.disabledReason,
    );
    selected = Math.max(0, firstAvailable);
  });

  function moveSelection(direction: 1 | -1): void {
    if (!filtered.length) return;
    let next = selected;
    for (let count = 0; count < filtered.length; count += 1) {
      next = (next + direction + filtered.length) % filtered.length;
      if (!filtered[next].disabledReason) {
        selected = next;
        return;
      }
    }
  }

  async function choose(index: number): Promise<void> {
    const destination = filtered[index];
    if (!destination || destination.disabledReason || working) return;
    working = true;
    try {
      await onMove(destination.path);
      onClose();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      working = false;
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(selected);
    }
  }
</script>

<div
  class="palette-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}
>
  <div
    class="palette move-picker"
    role="dialog"
    aria-modal="true"
    aria-label={`Move ${entry.name}`}
  >
    <header class="picker-header">
      <span>
        <strong>Move to</strong>
        <small>{entry.name}</small>
      </span>
      <button type="button" onclick={onClose} aria-label="Close">×</button>
    </header>
    <input
      bind:value={query}
      onkeydown={keydown}
      use:autofocus
      placeholder="Find a folder…"
      aria-label="Find a destination folder"
    />
    <div class="palette-results" role="listbox">
      {#each filtered as destination, index (destination.path)}
        <button
          class:selected={index === selected}
          type="button"
          role="option"
          aria-selected={index === selected}
          disabled={Boolean(destination.disabledReason) || working}
          onmouseenter={() => {
            if (!destination.disabledReason) selected = index;
          }}
          onclick={() => void choose(index)}
        >
          <span class="move-destination">
            <span class="move-destination-icon" aria-hidden="true">
              <FileTreeIcon name="folder" expanded={false} />
            </span>
            <span>
              <strong>{destination.label}</strong>
              {#if destination.disabledReason}
                <small>{destination.disabledReason}</small>
              {:else if destination.path}
                <small>/{destination.path}</small>
              {:else}
                <small>/</small>
              {/if}
            </span>
          </span>
        </button>
      {:else}
        <p class="palette-empty">No matching folders</p>
      {/each}
    </div>
    <footer class="palette-hint">Enter to move · Esc to cancel</footer>
  </div>
</div>
