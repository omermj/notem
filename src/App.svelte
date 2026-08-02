<script lang="ts">
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { open } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount, tick } from "svelte";
  import { SvelteDate } from "svelte/reactivity";
  import WorkspaceNode from "./lib/components/WorkspaceNode.svelte";
  import FileExplorer from "./lib/components/FileExplorer.svelte";
  import SearchPane from "./lib/components/SearchPane.svelte";
  import TagPane from "./lib/components/TagPane.svelte";
  import BacklinksPane from "./lib/components/BacklinksPane.svelte";
  import Outline from "./lib/components/Outline.svelte";
  import GraphView from "./lib/components/GraphView.svelte";
  import CommandPalette from "./lib/components/CommandPalette.svelte";
  import QuickSwitcher from "./lib/components/QuickSwitcher.svelte";
  import Ribbon from "./lib/components/Ribbon.svelte";
  import SettingsModal from "./lib/components/SettingsModal.svelte";
  import UpdateBanner from "./lib/components/UpdateBanner.svelte";
  import UpdateConsent from "./lib/components/UpdateConsent.svelte";
  import TemplatePicker from "./lib/components/TemplatePicker.svelte";
  import ConflictModal from "./lib/components/ConflictModal.svelte";
  import VaultUnavailableModal from "./lib/components/VaultUnavailableModal.svelte";
  import DebugTimingsModal from "./lib/components/DebugTimingsModal.svelte";
  import VaultSwitcherIcon from "./lib/components/VaultSwitcherIcon.svelte";
  import { configureCommands, handleShortcut } from "./lib/commands";
  import {
    attachment_import,
    errorMessage,
    file_read,
    index_rebuild,
    path_import,
    search_filename,
    debug_frontend_ready,
    debug_timings,
    startup_file,
    type StartupFile,
  } from "./lib/api";
  import { attachmentMarkdown } from "./lib/editor/attachments";
  import { imageAlt, markdownImage } from "./lib/editor/paths";
  import { nativeDropClientPosition } from "./lib/nativeDrop";
  import {
    formatDate,
    normalizeFolder,
    templateVariables,
  } from "./lib/productivity";
  import { typingTimings } from "./lib/performance";
  import {
    applyTheme,
    loadSettings,
    rememberVault,
    toggleTheme,
    settingsState,
  } from "./lib/stores/settings.svelte";
  import {
    createEmptyTab,
    activeTab,
    closeTab,
    dismissToast,
    findPane,
    focusPane,
    initializeDetachedWorkspace,
    navigateHistory,
    openGlobalSearch,
    openGraphTab,
    prepareVaultSwitch,
    restoreWorkspace,
    resizeSidebar,
    requestEditorInsertion,
    setNoteMode,
    showToast,
    splitPane,
    toggleSidebar,
    toggleReadingMode,
    uiState,
  } from "./lib/stores/ui.svelte";
  import { vaultState } from "./lib/stores/vault.svelte";
  import { updaterStore } from "./lib/stores/updater.svelte";
  import { updaterStartupAction } from "./lib/updater/policy";

  let openingVault = $state(false);
  let updaterStartupReady = $state(false);
  let updaterStartupStarted = false;
  let lastAssociatedFile = "";
  const currentTab = $derived(activeTab());
  const noteTitle = $derived(
    currentTab?.type === "graph"
      ? "Graph"
      : (currentTab?.path?.split("/").at(-1) ??
          vaultState.name ??
          "Welcome to NoteM"),
  );

  configureCommands({
    newNote: () => createRootNote(),
    save: () => saveCurrent(),
    toggleReading: toggleReadingMode,
    splitRight: () => splitPane("horizontal"),
    splitDown: () => splitPane("vertical"),
    openVault: () => chooseVault(),
    rebuildIndex: () => rebuildIndex(),
    toggleTheme,
    dailyNote: () => openDailyNote(),
    newTab: createEmptyTab,
    closeTab: () => closeTab(),
    historyBack: () => navigateAndLoad(-1),
    historyForward: () => navigateAndLoad(1),
    showPalette: () => {
      uiState.quickSwitcherOpen = false;
      uiState.commandPaletteOpen = true;
    },
    showQuickSwitcher: () => {
      uiState.commandPaletteOpen = false;
      uiState.quickSwitcherOpen = true;
    },
    showGlobalSearch: () => openGlobalSearch(),
    showGraph: () => openGraphTab(),
    showSettings: () => {
      uiState.commandPaletteOpen = false;
      uiState.quickSwitcherOpen = false;
      uiState.settingsOpen = true;
    },
    toggleLeftSidebar: () => toggleSidebar("left"),
    toggleRightSidebar: () => toggleSidebar("right"),
    insertTemplate: () => openTemplatePicker("insert"),
    insertImage: () => chooseImages(),
    newFromTemplate: () => openTemplatePicker("new"),
    showDebugTimings: () => showDebugTimings(),
  });

  onMount(() => {
    let disposed = false;
    let unlistenIndex: UnlistenFn | undefined;
    void listen<{ paths: string[] }>("notem://index-updated", (event) => {
      uiState.indexRevision += 1;
      void vaultState.refreshTree();
      void vaultState.handleExternalChanges(event.payload.paths);
    }).then((unlisten) => {
      unlistenIndex = unlisten;
    });
    let unlistenUnavailable: UnlistenFn | undefined;
    void listen("notem://vault-unavailable", () => {
      uiState.vaultUnavailable = true;
    }).then((unlisten) => {
      unlistenUnavailable = unlisten;
    });
    let unlistenOpenFile: UnlistenFn | undefined;
    void listen<StartupFile>("notem://open-file", (event) => {
      void openAssociatedFile(event.payload);
    }).then((unlisten) => {
      unlistenOpenFile = unlisten;
    });
    let unlistenExternalDrop: UnlistenFn | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        void handleExternalDrop(
          event.payload.paths,
          event.payload.position.x,
          event.payload.position.y,
        );
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else unlistenExternalDrop = unlisten;
      });
    const keydown = (event: KeyboardEvent) => handleShortcut(event);
    window.addEventListener("keydown", keydown, true);
    void reopenLastVault();
    void debug_frontend_ready(performance.now());
    return () => {
      disposed = true;
      window.removeEventListener("keydown", keydown, true);
      unlistenIndex?.();
      unlistenUnavailable?.();
      unlistenOpenFile?.();
      unlistenExternalDrop?.();
    };
  });

  async function reopenLastVault(): Promise<void> {
    try {
      const settings = await loadSettings();
      applyTheme();
      const detachedWindow = new URLSearchParams(window.location.search).has(
        "detached",
      );
      if (!detachedWindow) {
        updaterStartupReady = true;
        void startUpdaterAfterUiReady();
      }
      const associated = await startup_file();
      if (associated) {
        await openAssociatedFile(associated);
      } else if (settings.lastVault) {
        prepareVaultSwitch();
        await vaultState.open(settings.lastVault);
        const detached = new URLSearchParams(window.location.search).get(
          "detached",
        );
        if (detached) {
          initializeDetachedWorkspace();
          await vaultState.openFile(detached);
        } else {
          await restoreWorkspace();
        }
      }
    } catch (error) {
      if (errorMessage(error).startsWith("vault unavailable:")) {
        uiState.vaultUnavailable = true;
      } else {
        showToast(`Could not reopen the last vault: ${errorMessage(error)}`);
      }
    }
  }

  async function startUpdaterAfterUiReady(): Promise<void> {
    if (updaterStartupStarted) return;
    await tick();
    if (updaterStartupStarted) return;
    updaterStartupStarted = true;
    if (
      updaterStartupAction(
        settingsState.updateCheckPreference,
        settingsState.lastAutomaticUpdateAttemptAt,
        new SvelteDate().toISOString(),
      ) === "backgroundCheck"
    ) {
      void updaterStore.checkForUpdateInBackground();
    }
  }

  async function openAssociatedFile(file: StartupFile): Promise<void> {
    const identity = `${file.vault}/${file.path}`;
    if (lastAssociatedFile === identity) return;
    lastAssociatedFile = identity;
    try {
      prepareVaultSwitch();
      const path = await vaultState.open(file.vault);
      await rememberVault(path);
      await restoreWorkspace();
      await vaultState.openFile(file.path);
    } catch (error) {
      lastAssociatedFile = "";
      showToast(`Could not open ${file.path}: ${errorMessage(error)}`);
    }
  }

  async function handleExternalDrop(
    paths: string[],
    physicalX: number,
    physicalY: number,
  ): Promise<void> {
    try {
      const scale = await getCurrentWindow().scaleFactor();
      const { x: clientX, y: clientY } = nativeDropClientPosition(
        { x: physicalX, y: physicalY },
        scale,
      );
      const hit = document.elementFromPoint(clientX, clientY);
      const dropSurface = hit?.closest<HTMLElement>("[data-note-drop-pane]");
      const paneId = dropSurface?.dataset.noteDropPane;
      if (!paneId) {
        const explorer = hit?.closest<HTMLElement>("[data-file-explorer]");
        if (!explorer) return;
        const destination =
          hit?.closest<HTMLElement>("[data-drop-folder]")?.dataset.dropFolder ??
          "";
        const imported = await path_import(paths, destination);
        await vaultState.refreshTree();
        showToast(
          `Imported ${imported.length} ${
            imported.length === 1 ? "item" : "items"
          }`,
          "info",
        );
        return;
      }

      const pane = findPane(paneId);
      const tab = activeTab(pane);
      const notePath = tab?.path;
      const file = notePath ? vaultState.files[notePath] : null;
      if (!tab || !notePath || file?.viewKind !== "markdown" || file.readonly) {
        showToast("Drop attachments onto an editable Markdown note", "info");
        return;
      }

      const imported = [];
      for (const source of paths) {
        try {
          imported.push(await attachment_import(source, notePath));
        } catch (error) {
          showToast(errorMessage(error));
        }
      }
      if (!imported.length) return;
      await vaultState.refreshTree();

      const current = activeTab(findPane(paneId));
      if (current?.id !== tab.id || current.path !== notePath) {
        showToast(
          "Attachments were copied, but the target note changed before links could be inserted",
          "info",
        );
        return;
      }

      focusPane(paneId);
      setNoteMode(paneId, "edit");
      await tick();
      requestEditorInsertion(
        notePath,
        imported.map(attachmentMarkdown).join(""),
        { paneId, clientX, clientY },
      );
      showToast(
        `Imported ${imported.length} ${
          imported.length === 1 ? "attachment" : "attachments"
        }`,
        "info",
      );
    } catch (error) {
      showToast(`Could not import dropped files: ${errorMessage(error)}`);
    }
  }

  async function showDebugTimings(): Promise<void> {
    try {
      const typing = typingTimings();
      uiState.debugTimings = await debug_timings(typing.average, typing.max);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function chooseVault(): Promise<void> {
    if (openingVault) return;
    openingVault = true;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open NoteM Vault",
      });
      if (typeof selected !== "string") return;
      prepareVaultSwitch();
      const path = await vaultState.open(selected);
      await rememberVault(path);
      await restoreWorkspace();
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      openingVault = false;
    }
  }

  async function chooseImages(): Promise<void> {
    const tab = activeTab();
    if (!tab?.path) {
      showToast("Open a note before inserting an image", "info");
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        title: "Insert Image",
        filters: [
          {
            name: "Images",
            extensions: [
              "png",
              "jpg",
              "jpeg",
              "gif",
              "webp",
              "bmp",
              "svg",
              "avif",
            ],
          },
        ],
      });
      const paths =
        typeof selected === "string" ? [selected] : (selected ?? []);
      if (!paths.length) return;
      const imported = await Promise.all(
        paths.map((source) => attachment_import(source, tab.path!)),
      );
      const markdown = imported
        .map(
          (attachment) =>
            `${markdownImage(
              attachment.markdownPath,
              imageAlt(attachment.markdownPath),
            )}\n`,
        )
        .join("");
      if (tab.mode === "read") toggleReadingMode();
      requestEditorInsertion(tab.path, markdown);
      await vaultState.refreshTree();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function saveCurrent(): Promise<void> {
    try {
      await vaultState.save();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function createRootNote(): Promise<void> {
    if (!vaultState.path) return chooseVault();
    try {
      await vaultState.createNote();
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function rebuildIndex(): Promise<void> {
    if (!vaultState.path) return;
    try {
      const paths = await index_rebuild();
      await vaultState.refreshTree();
      showToast(`Rebuilt index for ${paths.length} notes`, "info");
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function openDailyNote(): Promise<void> {
    if (!vaultState.path) return chooseVault();
    const today = formatDate(new Date(), settingsState.dailyNoteDateFormat);
    const path = `${normalizeFolder(settingsState.dailyNotesFolder)}${today}.md`;
    try {
      const matches = await search_filename(path.replace(/\.md$/i, ""), 20);
      const existing = matches.find(
        (match) => match.path.toLowerCase() === path.toLowerCase(),
      );
      if (existing) await vaultState.openFile(existing.path);
      else {
        const template = settingsState.dailyNoteTemplate
          ? await file_read(settingsState.dailyNoteTemplate)
          : null;
        await vaultState.createNoteWithContent(
          path,
          template ? templateVariables(template.content, today) : "",
        );
      }
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function openTemplatePicker(mode: "insert" | "new"): void {
    if (!vaultState.path) {
      void chooseVault();
      return;
    }
    uiState.commandPaletteOpen = false;
    uiState.quickSwitcherOpen = false;
    uiState.templatePickerMode = mode;
    uiState.templatePickerOpen = true;
  }

  function beginSidebarResize(
    event: PointerEvent,
    side: "left" | "right",
  ): void {
    event.preventDefault();
    const move = (next: PointerEvent): void => {
      resizeSidebar(
        side,
        side === "left" ? next.clientX - 42 : window.innerWidth - next.clientX,
      );
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing-workspace");
    };
    document.body.classList.add("resizing-workspace");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  async function navigateAndLoad(delta: -1 | 1): Promise<void> {
    const path = navigateHistory(delta);
    if (!path) return;
    try {
      await vaultState.loadFile(path);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }
</script>

<svelte:head>
  <title>{noteTitle} — NoteM</title>
</svelte:head>

<div
  class="app-shell"
  class:left-sidebar-collapsed={!uiState.leftSidebarOpen}
  class:right-sidebar-collapsed={!uiState.rightSidebarOpen}
  style={`--left-sidebar-width: ${uiState.leftSidebarWidth}px; --right-sidebar-width: ${uiState.rightSidebarWidth}px`}
>
  <Ribbon />
  {#if uiState.leftSidebarOpen}
    <aside class="pane pane-left" aria-label="File explorer">
      <header class="pane-header">
        <button
          class="vault-switcher"
          type="button"
          onclick={chooseVault}
          disabled={openingVault}
          title={vaultState.path ? "Open another vault" : "Open vault"}
          aria-label={vaultState.path ? "Open another vault" : "Open vault"}
        >
          <strong>{vaultState.name ?? "NoteM"}</strong>
          {#if openingVault}
            <span class="vault-switcher-spinner" aria-hidden="true"></span>
          {:else}
            <VaultSwitcherIcon />
          {/if}
        </button>
        <span class="pane-header-actions">
          <button
            class="sidebar-collapse"
            type="button"
            onclick={() => toggleSidebar("left")}
            title="Collapse left sidebar"
            aria-label="Collapse left sidebar">‹</button
          >
        </span>
      </header>
      <nav class="sidebar-tabs" aria-label="Left sidebar">
        <button
          class:active={uiState.leftSidebarTab === "files"}
          onclick={() => (uiState.leftSidebarTab = "files")}>Files</button
        >
        <button
          class:active={uiState.leftSidebarTab === "search"}
          onclick={() => openGlobalSearch()}>Search</button
        >
        <button
          class:active={uiState.leftSidebarTab === "tags"}
          onclick={() => (uiState.leftSidebarTab = "tags")}>Tags</button
        >
        <button
          class:active={currentTab?.type === "graph"}
          onclick={() => openGraphTab()}>Graph</button
        >
      </nav>
      <section class="pane-content explorer-pane">
        {#if vaultState.path}
          {#if uiState.leftSidebarTab === "files"}
            <FileExplorer />
          {:else if uiState.leftSidebarTab === "search"}
            <SearchPane />
          {:else}
            <TagPane />
          {/if}
        {:else}
          <button class="empty-action" type="button" onclick={chooseVault}>
            Open a vault to browse notes
          </button>
        {/if}
      </section>
    </aside>

    <div
      class="sidebar-divider left"
      role="separator"
      aria-label="Resize file explorer"
      aria-orientation="vertical"
      onpointerdown={(event) => beginSidebarResize(event, "left")}
    ></div>
  {/if}

  <main class="main-pane">
    <div class="workspace-root">
      <WorkspaceNode node={uiState.workspace} />
    </div>
    <footer class="status-bar">
      <span>{vaultState.path ?? "No vault open"}</span>
      <span>
        {vaultState.dirty
          ? "Unsaved"
          : vaultState.currentFile
            ? "Saved"
            : currentTab?.type === "graph"
              ? "Graph"
              : "Markdown"}
      </span>
    </footer>
  </main>

  {#if uiState.rightSidebarOpen}
    <div
      class="sidebar-divider right"
      role="separator"
      aria-label="Resize context sidebar"
      aria-orientation="vertical"
      onpointerdown={(event) => beginSidebarResize(event, "right")}
    ></div>

    <aside class="pane pane-right" aria-label="Context sidebar">
      <header class="pane-header">
        <strong>Knowledge</strong>
        <button
          class="sidebar-collapse"
          type="button"
          onclick={() => toggleSidebar("right")}
          title="Collapse right sidebar"
          aria-label="Collapse right sidebar">›</button
        >
      </header>
      <nav class="sidebar-tabs" aria-label="Right sidebar">
        <button
          class:active={uiState.rightSidebarTab === "backlinks"}
          onclick={() => (uiState.rightSidebarTab = "backlinks")}
          >Backlinks</button
        >
        <button
          class:active={uiState.rightSidebarTab === "outline"}
          onclick={() => (uiState.rightSidebarTab = "outline")}>Outline</button
        >
        <button
          class:active={uiState.rightSidebarTab === "graph"}
          onclick={() => (uiState.rightSidebarTab = "graph")}>Local</button
        >
      </nav>
      <section
        class:graph-pane={uiState.rightSidebarTab === "graph"}
        class="pane-content knowledge-pane"
      >
        {#if uiState.rightSidebarTab === "backlinks"}
          <BacklinksPane />
        {:else if uiState.rightSidebarTab === "outline"}
          <Outline />
        {:else}
          <GraphView scope="local" activeId={uiState.activeNote} />
        {/if}
      </section>
    </aside>
  {/if}
</div>

<UpdateConsent visible={updaterStartupReady} />
<UpdateBanner />
<CommandPalette />
<QuickSwitcher />
<TemplatePicker />
<SettingsModal />
<ConflictModal />
<VaultUnavailableModal />
<DebugTimingsModal />

<div class="toast-stack" aria-live="polite">
  {#each uiState.toasts as toast (toast.id)}
    <button
      class:error={toast.kind === "error"}
      class="toast"
      type="button"
      onclick={() => dismissToast(toast.id)}
    >
      {toast.message}
    </button>
  {/each}
</div>
