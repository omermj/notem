<script lang="ts">
  import {
    errorMessage,
    outline_headings,
    outline_move,
    type Heading,
  } from "../api";
  import { requestEditorJump, showToast, uiState } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import type { HeadingDrag } from "../drag";
  import {
    beginInternalDrag,
    internalDropTarget,
    type DragPoint,
  } from "../internalDrag";

  let headings = $state<Heading[]>([]);
  let request = 0;

  $effect(() => {
    const path = uiState.activeNote;
    const revision = uiState.indexRevision;
    const current = ++request;
    if (!path) {
      headings = [];
      return;
    }
    void outline_headings(path)
      .then((result) => {
        if (current === request && revision === uiState.indexRevision)
          headings = result;
      })
      .catch((error: unknown) => showToast(errorMessage(error)));
  });

  async function navigate(heading: Heading): Promise<void> {
    const path = uiState.activeNote;
    if (!path) return;
    try {
      await vaultState.openFile(path);
      requestEditorJump(path, heading.line);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function moveHeading(
    dragged: HeadingDrag,
    target: Heading,
    point: DragPoint,
    targetElement: HTMLElement,
  ): Promise<void> {
    const path = uiState.activeNote;
    if (
      !dragged ||
      !path ||
      dragged.path !== path ||
      dragged.line === target.line
    )
      return;
    const bounds = targetElement.getBoundingClientRect();
    const after = point.clientY > bounds.top + bounds.height / 2;
    try {
      await vaultState.runEditOperation(async () => {
        await vaultState.save(path);
        const file = vaultState.files[path];
        if (!file) return;
        const result = await outline_move(
          path,
          dragged.line,
          target.line,
          after,
          file.mtime,
        );
        vaultState.replaceContent(path, result.content, result.mtime);
        uiState.indexRevision += 1;
      });
    } catch (error) {
      showToast(errorMessage(error));
    }
  }
</script>

<nav class="outline-list" aria-label="Document outline">
  {#each headings as heading (`${heading.line}:${heading.text}`)}
    <button
      class="outline-row"
      style:padding-left={`${8 + (heading.level - 1) * 13}px`}
      type="button"
      title="Drag to move this section"
      onpointerdown={(event) => {
        const path = uiState.activeNote;
        if (!path) return;
        const payload: HeadingDrag = {
          kind: "heading",
          path,
          line: heading.line,
        };
        beginInternalDrag(event, payload, { label: heading.text });
      }}
      use:internalDropTarget={{
        accepts: (payload) =>
          payload.kind === "heading" &&
          payload.path === uiState.activeNote &&
          payload.line !== heading.line,
        drop: (payload, point, targetElement) => {
          if (payload.kind === "heading")
            return moveHeading(payload, heading, point, targetElement);
        },
      }}
      onclick={() => navigate(heading)}
    >
      {heading.text}
    </button>
  {:else}
    <p class="muted">
      {uiState.activeNote
        ? "No headings in this note."
        : "Open a note to see its outline."}
    </p>
  {/each}
</nav>
