<script lang="ts" module>
  function autofocus(node: HTMLInputElement): void {
    requestAnimationFrame(() => node.focus());
  }
</script>

<script lang="ts">
  import { errorMessage, search_filename, type FilenameMatch } from "../api";
  import { uiState, showToast } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";

  let query = $state("");
  let results = $state<FilenameMatch[]>([]);
  let selected = $state(0);
  let searchGeneration = 0;
  const normalizedQuery = $derived(
    query.trim().replace(/\.md$/i, "").toLowerCase(),
  );
  const exactMatch = $derived(
    results.find(
      (result) =>
        result.path.replace(/\.md$/i, "").toLowerCase() === normalizedQuery,
    ),
  );
  const canCreate = $derived(Boolean(normalizedQuery) && !exactMatch);

  $effect(() => {
    if (!uiState.quickSwitcherOpen || !vaultState.path) return;
    const currentGeneration = ++searchGeneration;
    const timer = window.setTimeout(() => {
      void search_filename(query, 50)
        .then((matches) => {
          if (currentGeneration === searchGeneration) results = matches;
        })
        .catch((error: unknown) => showToast(errorMessage(error)));
    }, 80);
    return () => window.clearTimeout(timer);
  });

  function close(): void {
    uiState.quickSwitcherOpen = false;
    query = "";
    selected = 0;
  }

  async function choose(newTab: boolean): Promise<void> {
    const createSelected = canCreate && selected === 0;
    const resultIndex = selected - (canCreate ? 1 : 0);
    const match = results[resultIndex];
    try {
      if (createSelected) {
        await vaultState.createNoteAt(query.trim(), newTab);
      } else if (match) {
        await vaultState.openFile(match.path, newTab);
      } else {
        return;
      }
      close();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      selected = Math.min(
        selected + 1,
        results.length + (canCreate ? 1 : 0) - 1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(event.ctrlKey || event.metaKey);
    }
  }
</script>

{#if uiState.quickSwitcherOpen}
  <div
    class="palette-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) close();
    }}
  >
    <div
      class="palette"
      role="dialog"
      aria-modal="true"
      aria-label="Quick switcher"
    >
      <input
        bind:value={query}
        oninput={() => (selected = 0)}
        onkeydown={keydown}
        use:autofocus
        placeholder="Open or create a note…"
        aria-label="Search notes"
      />
      <div class="palette-results" role="listbox">
        {#if canCreate}
          <button
            class:selected={selected === 0}
            type="button"
            role="option"
            aria-selected={selected === 0}
            onmouseenter={() => (selected = 0)}
            onclick={() => void choose(false)}
          >
            <span>Create “{query.trim().replace(/\.md$/i, "")}”</span>
            <kbd>Enter</kbd>
          </button>
        {/if}
        {#each results as result, index (result.path)}
          <button
            class:selected={index + (canCreate ? 1 : 0) === selected}
            type="button"
            role="option"
            aria-selected={index + (canCreate ? 1 : 0) === selected}
            onmouseenter={() => (selected = index + (canCreate ? 1 : 0))}
            onclick={() => void choose(false)}
          >
            <span>
              <strong>{result.title || result.path.split("/").at(-1)}</strong>
              <small>{result.path}</small>
            </span>
          </button>
        {:else}
          {#if !query.trim()}
            <p class="palette-empty">Start typing to find a note</p>
          {/if}
        {/each}
      </div>
      <footer class="palette-hint">
        Enter to open · Ctrl/⌘+Enter for new tab
      </footer>
    </div>
  </div>
{/if}
