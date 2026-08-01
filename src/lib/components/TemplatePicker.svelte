<script lang="ts" module>
  function autofocus(node: HTMLInputElement): void {
    requestAnimationFrame(() => node.focus());
  }
</script>

<script lang="ts">
  import { errorMessage, file_read } from "../api";
  import {
    noteTitle,
    safeNoteName,
    templatePaths,
    templateVariables,
  } from "../productivity";
  import { settingsState } from "../stores/settings.svelte";
  import {
    activeTab,
    requestEditorInsertion,
    showToast,
    uiState,
  } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";

  let query = $state("");
  let title = $state("Untitled");
  let working = $state(false);
  const paths = $derived(
    templatePaths(vaultState.tree, settingsState.templatesFolder).filter(
      (path) => path.toLowerCase().includes(query.toLowerCase()),
    ),
  );

  function close(): void {
    uiState.templatePickerOpen = false;
    query = "";
    title = "Untitled";
  }

  async function choose(path: string): Promise<void> {
    if (working) return;
    working = true;
    try {
      const template = await file_read(path);
      if (uiState.templatePickerMode === "insert") {
        const activePath = activeTab()?.path;
        if (!activePath)
          throw new Error("Open a note before inserting a template");
        requestEditorInsertion(
          activePath,
          templateVariables(template.content, noteTitle(activePath)),
        );
      } else {
        const targetTitle = safeNoteName(title);
        await vaultState.createNoteWithContent(
          `${targetTitle}.md`,
          templateVariables(template.content, targetTitle),
        );
      }
      close();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      working = false;
    }
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }
</script>

{#if uiState.templatePickerOpen}
  <div
    class="palette-backdrop"
    role="presentation"
    onkeydown={keydown}
    onclick={(event) => {
      if (event.target === event.currentTarget) close();
    }}
  >
    <div
      class="palette template-picker"
      role="dialog"
      aria-modal="true"
      aria-label={uiState.templatePickerMode === "insert"
        ? "Insert template"
        : "New note from template"}
    >
      <header class="picker-header">
        <strong
          >{uiState.templatePickerMode === "insert"
            ? "Insert template"
            : "New note from template"}</strong
        >
        <button type="button" onclick={close} aria-label="Close">×</button>
      </header>
      {#if uiState.templatePickerMode === "new"}
        <label class="picker-field">
          <span>Note title</span>
          <input bind:value={title} />
        </label>
      {/if}
      <input
        bind:value={query}
        use:autofocus
        placeholder="Find a template…"
        aria-label="Filter templates"
      />
      <div class="palette-results">
        {#each paths as path (path)}
          <button type="button" disabled={working} onclick={() => choose(path)}>
            <span>
              <strong>{noteTitle(path)}</strong>
              <small>{path}</small>
            </span>
          </button>
        {:else}
          <p class="palette-empty">
            No Markdown templates in {settingsState.templatesFolder}
          </p>
        {/each}
      </div>
    </div>
  </div>
{/if}
