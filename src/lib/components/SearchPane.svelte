<script lang="ts">
  import { tick } from "svelte";
  import { errorMessage, search_fts, type SearchMatch } from "../api";
  import { requestEditorJump, showToast, uiState } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import HighlightedSnippet from "./HighlightedSnippet.svelte";
  import type { NoteDrag } from "../drag";
  import { beginInternalDrag } from "../internalDrag";

  let input: HTMLInputElement;
  let results = $state<SearchMatch[]>([]);
  let searching = $state(false);
  let request = 0;

  $effect(() => {
    const query = uiState.searchQuery.trim();
    const revision = uiState.indexRevision;
    const current = ++request;
    const timer = window.setTimeout(() => {
      if (!query) {
        results = [];
        searching = false;
        return;
      }
      searching = true;
      void search_fts(query, 150)
        .then((matches) => {
          if (current === request && revision === uiState.indexRevision)
            results = matches;
        })
        .catch((error: unknown) => showToast(errorMessage(error)))
        .finally(() => {
          if (current === request) searching = false;
        });
    }, 180);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    const focusRequest = uiState.searchFocusRequest;
    if (!focusRequest) return;
    void tick().then(() => input?.focus());
  });

  async function navigate(result: SearchMatch): Promise<void> {
    try {
      await vaultState.openFile(result.path);
      requestEditorJump(result.path, result.line);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }
</script>

<section class="knowledge-list" aria-label="Search">
  <label class="search-box">
    <span class="visually-hidden">Search notes</span>
    <input
      bind:this={input}
      value={uiState.searchQuery}
      oninput={(event) => {
        uiState.searchQuery = event.currentTarget.value;
        uiState.activeTagFilter = null;
      }}
      placeholder="Search, tag:#x, path:foo, &quot;phrase&quot;"
      spellcheck="false"
    />
  </label>
  {#if searching}
    <p class="muted knowledge-state">Searching…</p>
  {:else if !uiState.searchQuery.trim()}
    <p class="muted knowledge-state">Search note content and metadata.</p>
  {:else if !results.length}
    <p class="muted knowledge-state">No matches.</p>
  {:else}
    <p class="result-count">{results.length} matching files</p>
    {#each results as result (result.path)}
      <button
        class="knowledge-result"
        type="button"
        title="Drag to a tab bar, pane, or editor"
        onpointerdown={(event) => {
          const payload: NoteDrag = { kind: "note", path: result.path };
          beginInternalDrag(event, payload, {
            label: result.title || result.path,
          });
        }}
        onclick={() => navigate(result)}
      >
        <strong>{result.title || result.path.replace(/\.md$/i, "")}</strong>
        <span class="result-path">{result.path} · line {result.line}</span>
        <span class="result-snippet"
          ><HighlightedSnippet text={result.snippet} /></span
        >
      </button>
    {/each}
  {/if}
</section>
