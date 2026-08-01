<script lang="ts">
  import NoteEditor from "./NoteEditor.svelte";
  import ReadingView from "./ReadingView.svelte";
  import GraphView from "./GraphView.svelte";
  import TabBar from "./TabBar.svelte";
  import PropertiesPanel from "./PropertiesPanel.svelte";
  import FilePlaceholder from "./FilePlaceholder.svelte";
  import LazyPdfViewer from "./LazyPdfViewer.svelte";
  import {
    activeTab,
    focusPane,
    moveTab,
    splitPaneForDrop,
    updatePdfPosition,
    uiState,
    type DropEdge,
    type WorkspacePane,
  } from "../stores/ui.svelte";
  import { errorMessage } from "../api";
  import { showToast } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import { notePathFromDrag, type NotemDrag } from "../drag";
  import { internalDropTarget, type DragPoint } from "../internalDrag";

  let { pane }: { pane: WorkspacePane } = $props();
  const tab = $derived(activeTab(pane));
  const file = $derived(tab?.path ? vaultState.files[tab.path] : null);
  let dropEdge = $state<DropEdge | "center" | null>(null);
  let workspaceElement: HTMLElement;

  function focusOnPointerDown(node: HTMLElement): { destroy(): void } {
    const focus = () => focusPane(pane.id);
    node.addEventListener("pointerdown", focus);
    return {
      destroy: () => node.removeEventListener("pointerdown", focus),
    };
  }

  $effect(() => {
    const path = tab?.path;
    if (path && !vaultState.files[path]) {
      void vaultState.loadFile(path).catch((error: unknown) => {
        showToast(`Could not restore ${path}: ${errorMessage(error)}`);
      });
    }
  });

  function targetFor(point: DragPoint): DropEdge | "center" {
    const bounds = workspaceElement.getBoundingClientRect();
    const x = point.clientX - bounds.left;
    const y = point.clientY - bounds.top;
    const horizontal = splitBand(bounds.width);
    const vertical = splitBand(bounds.height);
    const edges: { edge: DropEdge; proximity: number }[] = [];
    if (x < horizontal) edges.push({ edge: "left", proximity: x / horizontal });
    if (x > bounds.width - horizontal) {
      edges.push({
        edge: "right",
        proximity: (bounds.width - x) / horizontal,
      });
    }
    if (y < vertical) edges.push({ edge: "top", proximity: y / vertical });
    if (y > bounds.height - vertical) {
      edges.push({
        edge: "bottom",
        proximity: (bounds.height - y) / vertical,
      });
    }
    if (edges.length > 0) {
      edges.sort((a, b) => a.proximity - b.proximity);
      return edges[0].edge;
    }
    return "center";
  }

  function splitBand(size: number): number {
    return Math.min(180, Math.max(100, size * 0.2), size * 0.35);
  }

  function dropPriority(point: DragPoint): number {
    return targetFor(point) === "center" ? 25 : 75;
  }

  function filePathFromDrag(payload: NotemDrag): string | null {
    if (payload.kind === "entry" && payload.entryKind === "file") {
      return payload.path;
    }
    return notePathFromDrag(payload);
  }

  async function handleDrop(
    payload: NotemDrag,
    point: DragPoint,
  ): Promise<void> {
    const destination = dropEdge ?? targetFor(point);
    dropEdge = null;
    const paneId =
      destination === "center"
        ? pane.id
        : splitPaneForDrop(pane.id, destination);
    if (!paneId) return;
    if (payload.kind === "tab") {
      moveTab(payload.paneId, payload.tabId, paneId);
      return;
    }
    const path = filePathFromDrag(payload);
    if (!path) return;
    try {
      await vaultState.openFile(path, true, paneId);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }
</script>

<div
  class="workspace-pane"
  class:focused={pane.id === uiState.focusedPaneId}
  class:drop-left={dropEdge === "left"}
  class:drop-right={dropEdge === "right"}
  class:drop-top={dropEdge === "top"}
  class:drop-bottom={dropEdge === "bottom"}
  class:drop-center={dropEdge === "center"}
  role="group"
  aria-label="Note pane"
  use:focusOnPointerDown
  use:internalDropTarget={{
    accepts: (payload) =>
      payload.kind === "tab" || filePathFromDrag(payload) !== null,
    priority: (_payload, point) => dropPriority(point),
    move: (_payload, point) => (dropEdge = targetFor(point)),
    leave: () => (dropEdge = null),
    drop: handleDrop,
    highlight: false,
  }}
>
  <TabBar {pane} />
  <article
    bind:this={workspaceElement}
    data-note-drop-pane={pane.id}
    class:editor-workspace={Boolean(file) || tab?.type === "graph"}
    class="workspace"
  >
    {#if tab?.type === "graph"}
      <GraphView />
    {:else if tab?.path && file}
      {#if file.viewKind === "pdf"}
        {#key `${tab.id}:${tab.path}:${file.mtime}`}
          <LazyPdfViewer
            path={tab.path}
            initialPage={tab.pdfPage}
            initialScale={tab.pdfScale}
            onPosition={(page, scale) =>
              updatePdfPosition(pane.id, page, scale)}
          />
        {/key}
      {:else if file.kind === "binary" || file.readonly}
        <FilePlaceholder {file} />
      {:else if tab.mode === "read"}
        <ReadingView path={tab.path} paneId={pane.id} />
      {:else}
        {#key `${tab.id}:${tab.path}`}
          <div class="note-edit-layout">
            <PropertiesPanel path={tab.path} />
            <NoteEditor path={tab.path} paneId={pane.id} />
          </div>
        {/key}
      {/if}
    {:else if tab?.path}
      <div class="welcome"><p>Loading {tab.path}…</p></div>
    {:else}
      <div class="welcome">
        <span class="welcome-icon" aria-hidden="true">N</span>
        <h1>{vaultState.path ? vaultState.name : "Welcome to NoteM"}</h1>
        <p>
          {vaultState.path
            ? "Open a note or use the quick switcher."
            : "Your local-first Markdown knowledge base."}
        </p>
      </div>
    {/if}
  </article>
</div>
