<script lang="ts">
  import {
    errorMessage,
    file_read,
    links_backlinks,
    links_link_unlinked,
    type BacklinkMention,
    type Backlinks,
  } from "../api";
  import { requestEditorJump, showToast, uiState } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import HighlightedSnippet from "./HighlightedSnippet.svelte";
  import type { NoteDrag } from "../drag";
  import { beginInternalDrag } from "../internalDrag";

  let backlinks = $state<Backlinks>({ linked: [], unlinked: [] });
  let loading = $state(false);
  let linkedOpen = $state(true);
  let unlinkedOpen = $state(true);
  let linking = $state<string | null>(null);
  let request = 0;

  $effect(() => {
    const path = uiState.activeNote;
    const revision = uiState.indexRevision;
    const current = ++request;
    if (!path) {
      backlinks = { linked: [], unlinked: [] };
      return;
    }
    loading = true;
    void links_backlinks(path)
      .then((result) => {
        if (current === request && revision === uiState.indexRevision)
          backlinks = result;
      })
      .catch((error: unknown) => showToast(errorMessage(error)))
      .finally(() => {
        if (current === request) loading = false;
      });
  });

  async function navigate(mention: BacklinkMention): Promise<void> {
    try {
      await vaultState.openFile(mention.path);
      requestEditorJump(mention.path, mention.line, {
        start: mention.start,
        end: mention.end,
      });
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function linkMention(mention: BacklinkMention): Promise<void> {
    const key = `${mention.path}:${mention.start}`;
    if (linking) return;
    linking = key;
    try {
      await vaultState.save(mention.path);
      await links_link_unlinked(
        mention.path,
        mention.start,
        mention.end,
        mention.text,
      );
      const fresh = await file_read(mention.path);
      const open = vaultState.files[mention.path];
      if (open) {
        open.content = fresh.content;
        open.mtime = fresh.mtime;
        open.dirty = false;
      }
      uiState.indexRevision += 1;
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      linking = null;
    }
  }
</script>

<section class="knowledge-list" aria-label="Backlinks">
  {#if !uiState.activeNote}
    <p class="muted">Open a note to see backlinks.</p>
  {:else if loading}
    <p class="muted">Loading backlinks…</p>
  {:else}
    <button
      class="section-toggle"
      type="button"
      aria-expanded={linkedOpen}
      onclick={() => (linkedOpen = !linkedOpen)}
    >
      <span>{linkedOpen ? "▾" : "▸"} Linked mentions</span>
      <span>{backlinks.linked.length}</span>
    </button>
    {#if linkedOpen}
      {#each backlinks.linked as mention (`${mention.path}:${mention.start}`)}
        <button
          class="knowledge-result compact"
          type="button"
          title="Drag to a tab bar, pane, or editor"
          onpointerdown={(event) => {
            const payload: NoteDrag = { kind: "note", path: mention.path };
            beginInternalDrag(event, payload, { label: mention.path });
          }}
          onclick={() => navigate(mention)}
        >
          <strong>{mention.path.replace(/\.md$/i, "")}</strong>
          <span class="result-snippet"
            ><HighlightedSnippet text={mention.snippet} /></span
          >
        </button>
      {:else}
        <p class="muted section-empty">No linked mentions.</p>
      {/each}
    {/if}

    <button
      class="section-toggle"
      type="button"
      aria-expanded={unlinkedOpen}
      onclick={() => (unlinkedOpen = !unlinkedOpen)}
    >
      <span>{unlinkedOpen ? "▾" : "▸"} Unlinked mentions</span>
      <span>{backlinks.unlinked.length}</span>
    </button>
    {#if unlinkedOpen}
      {#each backlinks.unlinked as mention (`${mention.path}:${mention.start}`)}
        <article class="unlinked-result">
          <button
            class="knowledge-result compact"
            type="button"
            title="Drag to a tab bar, pane, or editor"
            onpointerdown={(event) => {
              const payload: NoteDrag = { kind: "note", path: mention.path };
              beginInternalDrag(event, payload, { label: mention.path });
            }}
            onclick={() => navigate(mention)}
          >
            <strong>{mention.path.replace(/\.md$/i, "")}</strong>
            <span class="result-snippet"
              ><HighlightedSnippet text={mention.snippet} /></span
            >
          </button>
          <button
            class="link-it"
            type="button"
            disabled={linking !== null}
            onclick={() => linkMention(mention)}
          >
            {linking === `${mention.path}:${mention.start}`
              ? "Linking…"
              : "Link it"}
          </button>
        </article>
      {:else}
        <p class="muted section-empty">No unlinked mentions.</p>
      {/each}
    {/if}
  {/if}
</section>
