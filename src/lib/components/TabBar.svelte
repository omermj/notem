<script lang="ts">
  import {
    activateTab,
    closeTab,
    moveTab,
    setNoteMode,
    splitPane,
    type WorkspacePane,
  } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import { notePathFromDrag, type NotemDrag, type TabDrag } from "../drag";
  import {
    beginInternalDrag,
    internalDropTarget,
    type DragPoint,
  } from "../internalDrag";
  import { errorMessage, window_open_note } from "../api";
  import { showToast } from "../stores/ui.svelte";
  import ViewModeIcon from "./ViewModeIcon.svelte";
  import ContextMenu, { type ContextMenuItem } from "./ContextMenu.svelte";

  let { pane }: { pane: WorkspacePane } = $props();
  let contextMenu = $state<{ x: number; y: number } | null>(null);
  let activeTab = $derived(
    pane.tabs.find((tab) => tab.id === pane.activeTabId),
  );
  let viewModeAvailable = $derived(
    Boolean(
      activeTab?.path &&
      vaultState.files[activeTab.path]?.viewKind === "markdown",
    ),
  );

  function title(
    path: string | null,
    type: "empty" | "file" | "graph",
  ): string {
    if (type === "graph") return "Graph";
    return path?.split("/").at(-1)?.replace(/\.md$/i, "") ?? "New tab";
  }

  function middleClose(event: MouseEvent, tabId: string): void {
    if (event.button !== 1) return;
    event.preventDefault();
    closeTab(pane.id, tabId);
  }

  function showContext(event: MouseEvent, tabId: string): void {
    event.preventDefault();
    event.stopPropagation();
    activateTab(pane.id, tabId);
    contextMenu = { x: event.clientX, y: event.clientY };
  }

  function selectViewMode(mode: "edit" | "read"): void {
    activateTab(pane.id, pane.activeTabId);
    setNoteMode(pane.id, mode);
  }

  function acceptsDrop(payload: NotemDrag): boolean {
    return payload.kind === "tab" || filePathFromDrag(payload) !== null;
  }

  function filePathFromDrag(payload: NotemDrag): string | null {
    if (payload.kind === "entry" && payload.entryKind === "file") {
      return payload.path;
    }
    return notePathFromDrag(payload);
  }

  async function dropItem(
    payload: NotemDrag,
    beforeTabId?: string,
  ): Promise<void> {
    if (payload.kind === "tab") {
      moveTab(payload.paneId, payload.tabId, pane.id, beforeTabId);
      return;
    }
    const path = filePathFromDrag(payload);
    if (!path) return;
    try {
      await vaultState.openFile(path, true, pane.id);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function detachTab(
    point: DragPoint,
    tabId: string,
    path: string | null,
  ): Promise<void> {
    if (!path) return;
    const hasCoordinates = point.screenX !== 0 || point.screenY !== 0;
    const outside =
      point.screenX < window.screenX ||
      point.screenX > window.screenX + window.outerWidth ||
      point.screenY < window.screenY ||
      point.screenY > window.screenY + window.outerHeight;
    if (!hasCoordinates || !outside) return;
    try {
      await vaultState.save(path);
      await window_open_note(path);
      closeTab(pane.id, tabId);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function contextMenuItems(): ContextMenuItem[] {
    return [
      {
        label: "Split right",
        icon: "split-right",
        action: () => splitPane("horizontal", pane.id),
      },
      {
        label: "Split down",
        icon: "split-down",
        action: () => splitPane("vertical", pane.id),
      },
      { separator: true },
      {
        label: "Close tab",
        icon: "close",
        shortcut: navigator.platform.includes("Mac") ? "⌘W" : "Ctrl+W",
        action: () => closeTab(pane.id),
      },
    ];
  }
</script>

<nav
  class="tab-bar"
  aria-label="Open notes"
  use:internalDropTarget={{
    accepts: acceptsDrop,
    priority: 100,
    drop: (payload) => dropItem(payload),
  }}
>
  <div
    class="tab-strip"
    role="tablist"
    tabindex="-1"
    use:internalDropTarget={{
      accepts: acceptsDrop,
      priority: 100,
      drop: (payload) => dropItem(payload),
    }}
  >
    {#each pane.tabs as tab (tab.id)}
      <div
        class:active={tab.id === pane.activeTabId}
        class="workspace-tab"
        role="tab"
        tabindex="0"
        aria-selected={tab.id === pane.activeTabId}
        title={tab.type === "graph"
          ? "Knowledge graph"
          : (tab.path ?? "Empty tab")}
        onclick={() => activateTab(pane.id, tab.id)}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activateTab(pane.id, tab.id);
          }
        }}
        onauxclick={(event) => middleClose(event, tab.id)}
        oncontextmenu={(event) => showContext(event, tab.id)}
        onpointerdown={(event) => {
          const payload: TabDrag = {
            kind: "tab",
            paneId: pane.id,
            tabId: tab.id,
          };
          beginInternalDrag(event, payload, {
            label: title(tab.path, tab.type),
            onUnhandledDrop: (point) => detachTab(point, tab.id, tab.path),
          });
        }}
        use:internalDropTarget={{
          accepts: acceptsDrop,
          priority: 100,
          drop: (payload) => dropItem(payload, tab.id),
        }}
      >
        <span class="tab-title">{title(tab.path, tab.type)}</span>
        {#if tab.path && vaultState.files[tab.path]?.dirty}
          <span class="dirty-dot" title="Unsaved changes">●</span>
        {/if}
        <button
          class="tab-close"
          type="button"
          tabindex="-1"
          aria-label={`Close ${title(tab.path, tab.type)}`}
          onclick={(event) => {
            event.stopPropagation();
            closeTab(pane.id, tab.id);
          }}>×</button
        >
      </div>
    {/each}
  </div>
  <div
    class="view-mode-switch"
    class:unavailable={!viewModeAvailable}
    role="group"
    aria-label="Note view mode"
  >
    <button
      class="view-mode-option"
      class:active={activeTab?.mode === "edit"}
      type="button"
      disabled={!viewModeAvailable}
      aria-pressed={activeTab?.mode === "edit"}
      onclick={() => selectViewMode("edit")}
    >
      <ViewModeIcon name="edit" />
      <span>Edit</span>
    </button>
    <button
      class="view-mode-option"
      class:active={activeTab?.mode === "read"}
      type="button"
      disabled={!viewModeAvailable}
      aria-pressed={activeTab?.mode === "read"}
      onclick={() => selectViewMode("read")}
    >
      <ViewModeIcon name="read" />
      <span>Read</span>
    </button>
  </div>
</nav>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenuItems()}
    label="Tab actions"
    onClose={() => (contextMenu = null)}
  />
{/if}
