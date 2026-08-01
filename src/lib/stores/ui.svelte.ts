import { errorMessage, vault_settings_get, vault_settings_set } from "../api";
import type { DebugTimings } from "../api";

export type NoteMode = "edit" | "read";
export type SplitDirection = "horizontal" | "vertical";
export type WorkspaceTabType = "empty" | "file" | "graph";

export interface WorkspaceTab {
  id: string;
  type: WorkspaceTabType;
  path: string | null;
  scrollTop: number;
  cursor: number;
  mode: NoteMode;
  pdfPage: number;
  pdfScale: string;
}

export interface WorkspacePane {
  kind: "pane";
  id: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
  history: string[];
  historyIndex: number;
}

export interface WorkspaceSplit {
  kind: "split";
  id: string;
  direction: SplitDirection;
  ratio: number;
  children: [WorkspaceNode, WorkspaceNode];
}

export type WorkspaceNode = WorkspacePane | WorkspaceSplit;
export type DropEdge = "left" | "right" | "top" | "bottom";

let nextId = 1;
const id = (prefix: string): string => `${prefix}-${Date.now()}-${nextId++}`;

function newTab(
  path: string | null = null,
  type: WorkspaceTabType = path ? "file" : "empty",
): WorkspaceTab {
  return {
    id: id("tab"),
    type,
    path,
    scrollTop: 0,
    cursor: 0,
    mode: "edit",
    pdfPage: 1,
    pdfScale: "page-width",
  };
}

function newPane(
  path: string | null = null,
  type: WorkspaceTabType = path ? "file" : "empty",
): WorkspacePane {
  const tab = newTab(path, type);
  return {
    kind: "pane",
    id: id("pane"),
    tabs: [tab],
    activeTabId: tab.id,
    history: path ? [path] : [],
    historyIndex: path ? 0 : -1,
  };
}

const initialPane = newPane();

export const uiState = $state({
  leftSidebarOpen: true,
  rightSidebarOpen: true,
  leftSidebarWidth: 240,
  rightSidebarWidth: 260,
  leftSidebarTab: "files" as "files" | "search" | "tags",
  rightSidebarTab: "backlinks" as "backlinks" | "outline" | "graph",
  activeNote: null as string | null,
  activeTagFilter: null as string | null,
  searchQuery: "",
  searchFocusRequest: 0,
  indexRevision: 0,
  editorJump: null as {
    id: number;
    path: string;
    line: number;
    start?: number;
    end?: number;
  } | null,
  toasts: [] as { id: number; message: string; kind: "error" | "info" }[],
  workspace: initialPane as WorkspaceNode,
  focusedPaneId: initialPane.id,
  commandPaletteOpen: false,
  quickSwitcherOpen: false,
  settingsOpen: false,
  templatePickerOpen: false,
  templatePickerMode: "insert" as "insert" | "new",
  vaultUnavailable: false,
  debugTimings: null as DebugTimings | null,
  editorInsertion: null as {
    id: number;
    path: string;
    content: string;
    paneId?: string;
    clientX?: number;
    clientY?: number;
  } | null,
});

let nextToastId = 1;
let nextJumpId = 1;
let nextInsertionId = 1;
let persistenceTimer: number | null = null;
let workspaceSettings: Record<string, unknown> = {};
let persistenceEnabled = false;

export function allPanes(
  node: WorkspaceNode = uiState.workspace,
): WorkspacePane[] {
  return node.kind === "pane"
    ? [node]
    : [...allPanes(node.children[0]), ...allPanes(node.children[1])];
}

export function findPane(paneId = uiState.focusedPaneId): WorkspacePane | null {
  return allPanes().find((pane) => pane.id === paneId) ?? null;
}

export function activeTab(
  pane: WorkspacePane | null = findPane(),
): WorkspaceTab | null {
  return pane?.tabs.find((tab) => tab.id === pane.activeTabId) ?? null;
}

export function focusPane(paneId: string): void {
  if (!findPane(paneId)) return;
  uiState.focusedPaneId = paneId;
  syncActiveNote();
  scheduleWorkspaceSave();
}

export function activateTab(paneId: string, tabId: string): void {
  const pane = findPane(paneId);
  if (!pane?.tabs.some((tab) => tab.id === tabId)) return;
  pane.activeTabId = tabId;
  focusPane(paneId);
}

export function openPath(
  path: string,
  options: { newTab?: boolean; paneId?: string; recordHistory?: boolean } = {},
): void {
  const pane = findPane(options.paneId) ?? findPane();
  if (!pane) return;
  const current = activeTab(pane);
  let tab = pane.tabs.find((candidate) => candidate.path === path);
  if (!tab && options.newTab) {
    if (
      current?.type === "empty" &&
      current.path === null &&
      pane.tabs.length === 1
    ) {
      current.type = "file";
      current.path = path;
      current.scrollTop = 0;
      current.cursor = 0;
      current.pdfPage = 1;
      current.pdfScale = "page-width";
      tab = current;
    } else {
      tab = newTab(path);
      pane.tabs.push(tab);
    }
  } else if (!tab && current) {
    current.type = "file";
    current.path = path;
    current.scrollTop = 0;
    current.cursor = 0;
    current.pdfPage = 1;
    current.pdfScale = "page-width";
    tab = current;
  }
  if (!tab) return;
  pane.activeTabId = tab.id;
  uiState.focusedPaneId = pane.id;
  if (options.recordHistory !== false) pushHistory(pane, path);
  syncActiveNote();
  scheduleWorkspaceSave();
}

export function openGraphTab(paneId = uiState.focusedPaneId): void {
  const pane = findPane(paneId);
  if (!pane) return;
  let tab = pane.tabs.find((candidate) => candidate.type === "graph");
  if (!tab) {
    tab = newTab(null, "graph");
    pane.tabs.push(tab);
  }
  pane.activeTabId = tab.id;
  focusPane(pane.id);
}

export function createEmptyTab(paneId = uiState.focusedPaneId): void {
  const pane = findPane(paneId);
  if (!pane) return;
  const tab = newTab();
  pane.tabs.push(tab);
  pane.activeTabId = tab.id;
  focusPane(pane.id);
}

export function closeTab(paneId = uiState.focusedPaneId, tabId?: string): void {
  const pane = findPane(paneId);
  if (!pane) return;
  const panesBeforeClose = allPanes();
  const paneIndex = panesBeforeClose.findIndex(
    (candidate) => candidate.id === paneId,
  );
  const previouslyFocusedPaneId = uiState.focusedPaneId;
  const closing = tabId ?? pane.activeTabId;
  const index = pane.tabs.findIndex((tab) => tab.id === closing);
  if (index < 0) return;
  pane.tabs.splice(index, 1);
  if (!pane.tabs.length && panesBeforeClose.length > 1) {
    const workspace = removePane(uiState.workspace, paneId);
    if (!workspace) return;
    uiState.workspace = workspace;
    const remaining = allPanes();
    const previousFocus = remaining.find(
      (candidate) => candidate.id === previouslyFocusedPaneId,
    );
    const nextFocus =
      previousFocus ??
      remaining[Math.min(Math.max(0, paneIndex), remaining.length - 1)];
    uiState.focusedPaneId = nextFocus.id;
    syncActiveNote();
    scheduleWorkspaceSave();
    return;
  }
  if (!pane.tabs.length) pane.tabs.push(newTab());
  if (pane.activeTabId === closing) {
    pane.activeTabId = pane.tabs[Math.min(index, pane.tabs.length - 1)].id;
  }
  focusPane(pane.id);
}

export function reorderTab(paneId: string, fromId: string, toId: string): void {
  const pane = findPane(paneId);
  if (!pane || fromId === toId) return;
  const from = pane.tabs.findIndex((tab) => tab.id === fromId);
  const to = pane.tabs.findIndex((tab) => tab.id === toId);
  if (from < 0 || to < 0) return;
  const [tab] = pane.tabs.splice(from, 1);
  pane.tabs.splice(to, 0, tab);
  scheduleWorkspaceSave();
}

export function moveTab(
  fromPaneId: string,
  tabId: string,
  toPaneId: string,
  beforeTabId?: string,
): void {
  const source = findPane(fromPaneId);
  const target = findPane(toPaneId);
  if (!source || !target) return;
  const sourceIndex = source.tabs.findIndex((tab) => tab.id === tabId);
  if (sourceIndex < 0) return;

  if (source === target) {
    const destinationIndex = beforeTabId
      ? target.tabs.findIndex((tab) => tab.id === beforeTabId)
      : target.tabs.length;
    if (destinationIndex < 0) return;
    const [tab] = target.tabs.splice(sourceIndex, 1);
    const adjusted =
      sourceIndex < destinationIndex ? destinationIndex - 1 : destinationIndex;
    target.tabs.splice(adjusted, 0, tab);
    target.activeTabId = tab.id;
    focusPane(target.id);
    return;
  }

  const [tab] = source.tabs.splice(sourceIndex, 1);
  if (!source.tabs.length) {
    const empty = newTab();
    source.tabs.push(empty);
    source.activeTabId = empty.id;
  } else if (source.activeTabId === tabId) {
    source.activeTabId =
      source.tabs[Math.min(sourceIndex, source.tabs.length - 1)].id;
  }

  if (
    target.tabs.length === 1 &&
    target.tabs[0].type === "empty" &&
    target.tabs[0].path === null
  ) {
    target.tabs.splice(0, 1);
  }
  const destinationIndex = beforeTabId
    ? target.tabs.findIndex((candidate) => candidate.id === beforeTabId)
    : target.tabs.length;
  target.tabs.splice(
    destinationIndex < 0 ? target.tabs.length : destinationIndex,
    0,
    tab,
  );
  target.activeTabId = tab.id;
  focusPane(target.id);
}

function replaceNode(
  node: WorkspaceNode,
  paneId: string,
  replacement: WorkspaceNode,
): WorkspaceNode {
  if (node.kind === "pane") return node.id === paneId ? replacement : node;
  node.children = [
    replaceNode(node.children[0], paneId, replacement),
    replaceNode(node.children[1], paneId, replacement),
  ];
  return node;
}

function removePane(node: WorkspaceNode, paneId: string): WorkspaceNode | null {
  if (node.kind === "pane") return node.id === paneId ? null : node;
  const first = removePane(node.children[0], paneId);
  const second = removePane(node.children[1], paneId);
  if (!first) return second;
  if (!second) return first;
  node.children = [first, second];
  return node;
}

export function splitPane(
  direction: SplitDirection,
  paneId = uiState.focusedPaneId,
): void {
  const pane = findPane(paneId);
  if (!pane) return;
  const current = activeTab(pane);
  const sibling = newPane(
    current?.path ?? null,
    current?.type === "graph" ? "graph" : current?.path ? "file" : "empty",
  );
  const split: WorkspaceSplit = {
    kind: "split",
    id: id("split"),
    direction,
    ratio: 0.5,
    children: [pane, sibling],
  };
  uiState.workspace = replaceNode(uiState.workspace, paneId, split);
  focusPane(sibling.id);
}

export function splitPaneForDrop(
  paneId: string,
  edge: DropEdge,
): string | null {
  const pane = findPane(paneId);
  if (!pane) return null;
  const sibling = newPane();
  const direction: SplitDirection =
    edge === "left" || edge === "right" ? "horizontal" : "vertical";
  const siblingFirst = edge === "left" || edge === "top";
  const split: WorkspaceSplit = {
    kind: "split",
    id: id("split"),
    direction,
    ratio: 0.5,
    children: siblingFirst ? [sibling, pane] : [pane, sibling],
  };
  uiState.workspace = replaceNode(uiState.workspace, paneId, split);
  focusPane(sibling.id);
  return sibling.id;
}

export function resizeWorkspaceSplit(splitId: string, ratio: number): void {
  const clamped = Math.max(0.15, Math.min(0.85, ratio));
  const visit = (node: WorkspaceNode): boolean => {
    if (node.kind === "pane") return false;
    if (node.id === splitId) {
      node.ratio = clamped;
      return true;
    }
    return visit(node.children[0]) || visit(node.children[1]);
  };
  if (visit(uiState.workspace)) scheduleWorkspaceSave();
}

export function resizeSidebar(side: "left" | "right", width: number): void {
  const clamped = Math.round(Math.max(180, Math.min(520, width)));
  if (side === "left") uiState.leftSidebarWidth = clamped;
  else uiState.rightSidebarWidth = clamped;
  scheduleWorkspaceSave();
}

export function toggleSidebar(side: "left" | "right"): void {
  if (side === "left") uiState.leftSidebarOpen = !uiState.leftSidebarOpen;
  else uiState.rightSidebarOpen = !uiState.rightSidebarOpen;
  scheduleWorkspaceSave();
}

export function toggleReadingMode(): void {
  const tab = activeTab();
  if (!tab?.path) return;
  tab.mode = tab.mode === "edit" ? "read" : "edit";
  scheduleWorkspaceSave();
}

export function setNoteMode(paneId: string, mode: NoteMode): void {
  const tab = activeTab(findPane(paneId));
  if (!tab?.path || tab.mode === mode) return;
  tab.mode = mode;
  scheduleWorkspaceSave();
}

export function updateTabPosition(
  paneId: string,
  cursor: number,
  scrollTop: number,
): void {
  const tab = activeTab(findPane(paneId));
  if (!tab) return;
  tab.cursor = cursor;
  tab.scrollTop = scrollTop;
  scheduleWorkspaceSave();
}

export function updatePdfPosition(
  paneId: string,
  page: number,
  scale: string,
): void {
  const tab = activeTab(findPane(paneId));
  if (!tab) return;
  tab.pdfPage = Math.max(1, Math.round(page));
  tab.pdfScale = scale;
  scheduleWorkspaceSave();
}

export function remapWorkspacePaths(previous: string, next: string): void {
  for (const pane of allPanes()) {
    for (const tab of pane.tabs) {
      if (tab.path === previous || tab.path?.startsWith(`${previous}/`)) {
        tab.path = `${next}${tab.path.slice(previous.length)}`;
      }
    }
    pane.history = pane.history.map((path) =>
      path === previous || path.startsWith(`${previous}/`)
        ? `${next}${path.slice(previous.length)}`
        : path,
    );
  }
  syncActiveNote();
  scheduleWorkspaceSave();
}

export function removeWorkspacePaths(path: string): void {
  for (const pane of allPanes()) {
    pane.tabs = pane.tabs.filter(
      (tab) => tab.path !== path && !tab.path?.startsWith(`${path}/`),
    );
    if (!pane.tabs.length) pane.tabs.push(newTab());
    if (!pane.tabs.some((tab) => tab.id === pane.activeTabId)) {
      pane.activeTabId = pane.tabs[0].id;
    }
    pane.history = pane.history.filter(
      (entry) => entry !== path && !entry.startsWith(`${path}/`),
    );
    pane.historyIndex = Math.min(pane.historyIndex, pane.history.length - 1);
  }
  syncActiveNote();
  scheduleWorkspaceSave();
}

export function navigateHistory(delta: -1 | 1): string | null {
  const pane = findPane();
  if (!pane) return null;
  const next = pane.historyIndex + delta;
  if (next < 0 || next >= pane.history.length) return null;
  pane.historyIndex = next;
  const path = pane.history[next];
  openPath(path, { paneId: pane.id, recordHistory: false });
  return path;
}

function pushHistory(pane: WorkspacePane, path: string): void {
  if (pane.history[pane.historyIndex] === path) return;
  pane.history.splice(pane.historyIndex + 1);
  pane.history.push(path);
  if (pane.history.length > 100) pane.history.shift();
  pane.historyIndex = pane.history.length - 1;
}

function syncActiveNote(): void {
  const path = activeTab()?.path;
  uiState.activeNote = path?.toLowerCase().endsWith(".md") ? path : null;
}

function validWorkspace(value: unknown): value is WorkspaceNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<WorkspaceNode>;
  if (node.kind === "pane") {
    if (
      typeof node.id !== "string" ||
      !Array.isArray(node.tabs) ||
      node.tabs.length === 0
    ) {
      return false;
    }
    for (const value of node.tabs) {
      if (!value || typeof value !== "object") return false;
      const candidate = value as Partial<WorkspaceTab>;
      if (
        typeof candidate.id !== "string" ||
        (candidate.path !== null && typeof candidate.path !== "string")
      ) {
        return false;
      }
      if (!candidate.type) {
        candidate.type = candidate.path ? "file" : "empty";
      }
      if (!["empty", "file", "graph"].includes(candidate.type)) return false;
      if (typeof candidate.pdfPage !== "number") candidate.pdfPage = 1;
      if (typeof candidate.pdfScale !== "string") {
        candidate.pdfScale = "page-width";
      }
    }
    return true;
  }
  return (
    node.kind === "split" &&
    Array.isArray(node.children) &&
    node.children.length === 2 &&
    (typeof node.ratio === "number" || ((node.ratio = 0.5), true)) &&
    validWorkspace(node.children[0]) &&
    validWorkspace(node.children[1])
  );
}

export async function restoreWorkspace(): Promise<void> {
  const settings = await vault_settings_get();
  workspaceSettings = settings;
  persistenceEnabled = true;
  if (validWorkspace(settings.workspace)) {
    uiState.workspace = settings.workspace;
    const panes = allPanes();
    uiState.focusedPaneId =
      typeof settings.focusedPaneId === "string" &&
      panes.some((pane) => pane.id === settings.focusedPaneId)
        ? settings.focusedPaneId
        : panes[0].id;
  } else {
    const pane = newPane();
    uiState.workspace = pane;
    uiState.focusedPaneId = pane.id;
  }
  if (typeof settings.leftSidebarWidth === "number") {
    uiState.leftSidebarWidth = Math.max(
      180,
      Math.min(520, settings.leftSidebarWidth),
    );
  }
  if (typeof settings.rightSidebarWidth === "number") {
    uiState.rightSidebarWidth = Math.max(
      180,
      Math.min(520, settings.rightSidebarWidth),
    );
  }
  uiState.leftSidebarOpen =
    typeof settings.leftSidebarOpen === "boolean"
      ? settings.leftSidebarOpen
      : true;
  uiState.rightSidebarOpen =
    typeof settings.rightSidebarOpen === "boolean"
      ? settings.rightSidebarOpen
      : true;
  syncActiveNote();
}

export function initializeDetachedWorkspace(): void {
  persistenceEnabled = false;
  workspaceSettings = {};
  const pane = newPane();
  uiState.workspace = pane;
  uiState.focusedPaneId = pane.id;
  uiState.leftSidebarOpen = false;
  uiState.rightSidebarOpen = false;
  syncActiveNote();
}

export function prepareVaultSwitch(): void {
  persistenceEnabled = false;
  workspaceSettings = {};
  if (persistenceTimer !== null) {
    window.clearTimeout(persistenceTimer);
    persistenceTimer = null;
  }
}

export function scheduleWorkspaceSave(): void {
  if (!persistenceEnabled) return;
  if (persistenceTimer !== null) window.clearTimeout(persistenceTimer);
  persistenceTimer = window.setTimeout(() => {
    persistenceTimer = null;
    workspaceSettings = {
      ...workspaceSettings,
      workspace: $state.snapshot(uiState.workspace),
      focusedPaneId: uiState.focusedPaneId,
      leftSidebarOpen: uiState.leftSidebarOpen,
      rightSidebarOpen: uiState.rightSidebarOpen,
      leftSidebarWidth: uiState.leftSidebarWidth,
      rightSidebarWidth: uiState.rightSidebarWidth,
    };
    void vault_settings_set(workspaceSettings).catch((error: unknown) =>
      showToast(errorMessage(error)),
    );
  }, 250);
}

export function showToast(
  message: string,
  kind: "error" | "info" = "error",
): void {
  const toastId = nextToastId++;
  uiState.toasts.push({ id: toastId, message, kind });
  window.setTimeout(() => dismissToast(toastId), 5000);
}

export function dismissToast(toastId: number): void {
  const index = uiState.toasts.findIndex((toast) => toast.id === toastId);
  if (index >= 0) uiState.toasts.splice(index, 1);
}

export function setTagFilter(tag: string): void {
  const normalized = tag.replace(/^#/, "");
  uiState.activeTagFilter = normalized;
  uiState.searchQuery = `tag:#${normalized}`;
  openGlobalSearch(false);
}

export function openGlobalSearch(focus = true): void {
  uiState.leftSidebarOpen = true;
  uiState.leftSidebarTab = "search";
  if (focus) uiState.searchFocusRequest += 1;
  scheduleWorkspaceSave();
}

export function requestEditorJump(
  path: string,
  line: number,
  range?: { start: number; end: number },
): void {
  const tab = activeTab();
  if (tab?.path === path) tab.mode = "edit";
  uiState.editorJump = {
    id: nextJumpId++,
    path,
    line,
    ...range,
  };
}

export function requestEditorInsertion(
  path: string,
  content: string,
  target?: { paneId: string; clientX?: number; clientY?: number },
): void {
  uiState.editorInsertion = {
    id: nextInsertionId++,
    path,
    content,
    ...target,
  };
}
