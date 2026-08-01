<script lang="ts" module>
  function focusAndSelect(node: HTMLInputElement): void {
    requestAnimationFrame(() => {
      node.focus();
      const extension = node.value.toLowerCase().endsWith(".md") ? 3 : 0;
      node.setSelectionRange(0, node.value.length - extension);
    });
  }
</script>

<script lang="ts">
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { file_reveal, type VaultEntry } from "../api";
  import { noteWikilink } from "../fileActions";
  import { vaultState } from "../stores/vault.svelte";
  import { errorMessage } from "../api";
  import { showToast } from "../stores/ui.svelte";
  import ExplorerActionIcon from "./ExplorerActionIcon.svelte";
  import ContextMenu, { type ContextMenuItem } from "./ContextMenu.svelte";
  import FileTreeIcon from "./FileTreeIcon.svelte";
  import MovePicker from "./MovePicker.svelte";
  import type { EntryDrag, NotemDrag } from "../drag";
  import { beginInternalDrag, internalDropTarget } from "../internalDrag";

  let expanded = $state<Record<string, boolean>>({});
  let renamingPath = $state<string | null>(null);
  let renameValue = $state("");
  let draggingEntry = $state(false);
  let deleteTarget = $state<VaultEntry | null>(null);
  let moveTarget = $state<VaultEntry | null>(null);
  let contextMenu = $state<{
    entry: VaultEntry | null;
    x: number;
    y: number;
  } | null>(null);
  let explorer: HTMLDivElement;

  function parentPath(path: string): string {
    const separator = path.lastIndexOf("/");
    return separator < 0 ? "" : path.slice(0, separator);
  }

  function creationParent(entry: VaultEntry | null): string {
    if (!entry) return "";
    return entry.kind === "folder" ? entry.path : parentPath(entry.path);
  }

  function toggle(entry: VaultEntry): void {
    if (entry.kind === "folder") {
      expanded[entry.path] = !expanded[entry.path];
    }
  }

  async function openEntry(entry: VaultEntry, newTab = false): Promise<void> {
    if (entry.kind === "folder") {
      toggle(entry);
      return;
    }
    try {
      await vaultState.openFile(entry.path, newTab);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function showContextMenu(event: MouseEvent, entry: VaultEntry | null): void {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    contextMenu = { entry, x: event.clientX, y: event.clientY };
  }

  function handleEntryPointerDown(
    event: PointerEvent,
    entry: VaultEntry,
  ): void {
    const contextClick =
      event.button === 2 || (event.button === 0 && event.ctrlKey);
    if (contextClick) {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      return;
    }
    beginDrag(event, entry);
  }

  async function createNote(entry: VaultEntry | null): Promise<void> {
    contextMenu = null;
    try {
      await vaultState.createNote(creationParent(entry));
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function createFolder(entry: VaultEntry | null): Promise<void> {
    contextMenu = null;
    try {
      const path = await vaultState.createFolder(creationParent(entry));
      expanded[creationParent(entry)] = true;
      renamingPath = path;
      renameValue = path.split("/").at(-1) ?? path;
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function startRename(entry: VaultEntry): void {
    contextMenu = null;
    renamingPath = entry.path;
    renameValue = entry.name;
  }

  async function commitRename(): Promise<void> {
    const path = renamingPath;
    const name = renameValue.trim();
    renamingPath = null;
    if (!path || !name) return;
    const existingName = path.split("/").at(-1);
    if (name === existingName) return;
    try {
      await vaultState.rename(path, name);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function requestDelete(entry: VaultEntry): void {
    contextMenu = null;
    deleteTarget = entry;
  }

  async function confirmDelete(): Promise<void> {
    const target = deleteTarget;
    deleteTarget = null;
    if (!target) return;
    try {
      await vaultState.delete(target.path);
      showToast(`Moved “${target.name}” to Trash`, "info");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function reveal(entry: VaultEntry): Promise<void> {
    contextMenu = null;
    try {
      await file_reveal(entry.path);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function copyWikilink(entry: VaultEntry): Promise<void> {
    contextMenu = null;
    const wikilink = entry.kind === "file" ? noteWikilink(entry.path) : null;
    if (!wikilink) return;
    try {
      await writeText(wikilink);
      showToast(`Copied ${wikilink}`, "info");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function beginDrag(event: PointerEvent, entry: VaultEntry): void {
    const payload: EntryDrag = {
      kind: "entry",
      path: entry.path,
      entryKind: entry.kind,
    };
    beginInternalDrag(event, payload, {
      label: entry.name,
      onStart: () => (draggingEntry = true),
      onEnd: () => (draggingEntry = false),
    });
  }

  function findEntry(
    path: string,
    entries = vaultState.tree,
  ): VaultEntry | null {
    for (const entry of entries) {
      if (entry.path === path) return entry;
      const child = findEntry(path, entry.children);
      if (child) return child;
    }
    return null;
  }

  async function moveEntry(source: string, destination: string): Promise<void> {
    if (parentPath(source) === destination) return;
    try {
      await vaultState.move(source, destination);
      expanded[destination] = true;
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function addDroppedTag(tag: string, path: string): Promise<void> {
    try {
      await vaultState.addTag(path, tag);
      showToast(`Added #${tag} to ${path}`, "info");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function dropOnTrash(payload: NotemDrag): void {
    if (payload.kind !== "entry") return;
    draggingEntry = false;
    const entry = findEntry(payload.path);
    if (entry) requestDelete(entry);
  }

  function contextMenuItems(entry: VaultEntry | null): ContextMenuItem[] {
    const wikilink = entry?.kind === "file" ? noteWikilink(entry.path) : null;
    const items: ContextMenuItem[] = [
      {
        label: "New note",
        icon: "note",
        action: () => void createNote(entry),
      },
      {
        label: "New folder",
        icon: "folder",
        action: () => void createFolder(entry),
      },
    ];
    if (!entry) return items;
    return [
      ...items,
      { separator: true },
      { label: "Rename", icon: "rename", action: () => startRename(entry) },
      {
        label: "Move to…",
        icon: "move",
        action: () => (moveTarget = entry),
      },
      {
        label: "Reveal in file manager",
        icon: "reveal",
        action: () => void reveal(entry),
      },
      ...(wikilink
        ? [
            {
              label: "Copy wikilink",
              icon: "copy" as const,
              action: () => void copyWikilink(entry),
            },
          ]
        : []),
      { separator: true },
      {
        label: "Move to Trash…",
        icon: "trash",
        danger: true,
        action: () => requestDelete(entry),
      },
    ];
  }
</script>

{#snippet entries(nodes: VaultEntry[], depth: number)}
  {#each nodes as entry (entry.path)}
    <div
      class:active={vaultState.currentFile?.path === entry.path}
      class="tree-row"
      style={`--tree-depth: ${depth}`}
    >
      <button
        class="tree-entry"
        type="button"
        role="treeitem"
        aria-selected={vaultState.currentFile?.path === entry.path}
        aria-expanded={entry.kind === "folder"
          ? (expanded[entry.path] ?? false)
          : undefined}
        data-drop-folder={entry.kind === "folder" ? entry.path : undefined}
        onpointerdown={(event) => handleEntryPointerDown(event, entry)}
        oncontextmenu={(event) => showContextMenu(event, entry)}
        use:internalDropTarget={{
          accepts: (payload) =>
            entry.kind === "folder"
              ? payload.kind === "entry" &&
                payload.path !== entry.path &&
                !entry.path.startsWith(`${payload.path}/`)
              : payload.kind === "tag" &&
                entry.path.toLowerCase().endsWith(".md"),
          drop: (payload) => {
            if (payload.kind === "entry")
              return moveEntry(payload.path, entry.path);
            if (payload.kind === "tag")
              return addDroppedTag(payload.tag, entry.path);
          },
        }}
        onclick={(event) =>
          void openEntry(entry, event.metaKey || event.ctrlKey)}
      >
        <span class="tree-chevron" aria-hidden="true">
          {#if entry.kind === "folder"}
            <FileTreeIcon
              name="chevron"
              expanded={expanded[entry.path] ?? false}
            />
          {/if}
        </span>
        <span
          class:folder={entry.kind === "folder"}
          class="tree-icon"
          aria-hidden="true"
        >
          <FileTreeIcon
            name={entry.kind === "folder" ? "folder" : "file"}
            expanded={expanded[entry.path] ?? false}
          />
        </span>
        {#if renamingPath === entry.path}
          <input
            class="rename-input"
            aria-label={`Rename ${entry.name}`}
            bind:value={renameValue}
            onclick={(event) => event.stopPropagation()}
            onkeydown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                renamingPath = null;
              }
            }}
            onblur={() => void commitRename()}
            use:focusAndSelect
          />
        {:else}
          <span class="tree-name">{entry.name}</span>
        {/if}
      </button>
    </div>
    {#if entry.kind === "folder" && expanded[entry.path]}
      {@render entries(entry.children, depth + 1)}
    {/if}
  {/each}
{/snippet}

<div
  class="file-explorer"
  data-file-explorer
  bind:this={explorer}
  role="tree"
  tabindex="0"
  oncontextmenu={(event) => {
    if (event.target === event.currentTarget) showContextMenu(event, null);
  }}
  use:internalDropTarget={{
    accepts: (payload, _point, hit) =>
      payload.kind === "entry" && hit === explorer,
    drop: (payload) => {
      if (payload.kind === "entry") return moveEntry(payload.path, "");
    },
  }}
>
  <div class="explorer-actions">
    <span class="explorer-actions-title">Files</span>
    <button
      class="explorer-action primary"
      type="button"
      onclick={() => void createNote(null)}
      title="New note"
      aria-label="New note"
    >
      <ExplorerActionIcon name="note" />
    </button>
    <button
      class="explorer-action"
      type="button"
      onclick={() => void createFolder(null)}
      title="New folder"
      aria-label="New folder"
    >
      <ExplorerActionIcon name="folder" />
    </button>
  </div>
  {#if vaultState.tree.length}
    {@render entries(vaultState.tree, 0)}
  {:else}
    <p class="muted explorer-empty">This vault is empty.</p>
  {/if}
  {#if draggingEntry}
    <div
      class="explorer-trash-drop"
      role="button"
      tabindex="-1"
      use:internalDropTarget={{
        accepts: (payload) => payload.kind === "entry",
        drop: dropOnTrash,
      }}
    >
      Drop to move to Trash
    </div>
  {/if}
</div>

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenuItems(contextMenu.entry)}
    label="File actions"
    onClose={() => (contextMenu = null)}
  />
{/if}

{#if moveTarget}
  <MovePicker
    entry={moveTarget}
    tree={vaultState.tree}
    onMove={async (destination) => {
      const name = moveTarget!.name;
      await vaultState.move(moveTarget!.path, destination);
      expanded[destination] = true;
      showToast(
        `Moved “${name}” to ${destination ? `“${destination}”` : "Vault root"}`,
        "info",
      );
    }}
    onClose={() => (moveTarget = null)}
  />
{/if}

{#if deleteTarget}
  <div class="modal-backdrop" role="presentation">
    <section class="confirm-modal" role="dialog" aria-modal="true">
      <h2>Move to Trash?</h2>
      <p>
        “{deleteTarget.name}”{deleteTarget.kind === "folder"
          ? " and everything inside it"
          : ""} will be moved to the OS Trash.
      </p>
      <div class="modal-actions">
        <button type="button" onclick={() => (deleteTarget = null)}
          >Cancel</button
        >
        <button class="danger-button" type="button" onclick={confirmDelete}
          >Move to Trash</button
        >
      </div>
    </section>
  </div>
{/if}
