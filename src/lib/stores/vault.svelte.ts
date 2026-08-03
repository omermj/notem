import {
  errorMessage,
  file_create,
  file_create_with_content,
  file_delete,
  file_info,
  file_move,
  file_read,
  file_rename,
  file_write,
  file_write_force,
  folder_create,
  frontmatter_get,
  frontmatter_set,
  search_filename,
  vault_list,
  vault_open,
  type VaultEntry,
} from "../api";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import {
  activeTab,
  openPath,
  remapWorkspacePaths,
  removeWorkspacePaths,
  scheduleWorkspaceSave,
  showToast,
} from "./ui.svelte";

export interface OpenFile {
  path: string;
  content: string;
  mtime: number;
  dirty: boolean;
  saving: boolean;
  size: number;
  kind: "text" | "binary";
  readonly: boolean;
  warning: string | null;
  viewKind: "markdown" | "pdf" | "binary";
}

export interface EditConflict {
  path: string;
  mine: string;
  disk: string;
  diskMtime: number;
}

export class VaultStore {
  path = $state<string | null>(null);
  name = $state<string | null>(null);
  tree = $state<VaultEntry[]>([]);
  files = $state<Record<string, OpenFile>>({});
  conflict = $state<EditConflict | null>(null);
  updateInstallationLocked = $state(false);
  private autosaveTimers = new SvelteMap<string, number>();
  private activeSaves = new SvelteMap<string, Promise<void>>();
  private activeLoads = new SvelteMap<string, Promise<OpenFile>>();
  private activeEditOperations = new SvelteSet<Promise<unknown>>();

  get currentFile(): OpenFile | null {
    const path = activeTab()?.path;
    return path ? (this.files[path] ?? null) : null;
  }

  get dirty(): boolean {
    return this.currentFile?.dirty ?? false;
  }

  get saving(): boolean {
    return this.currentFile?.saving ?? false;
  }

  async open(path: string): Promise<string> {
    await this.saveAll();
    const info = await vault_open(path);
    this.path = info.path;
    this.name = info.name;
    this.files = {};
    await this.refreshTree();
    return info.path;
  }

  async refreshTree(): Promise<void> {
    this.tree = await vault_list();
  }

  async loadFile(path: string): Promise<OpenFile> {
    const existing = this.files[path];
    if (existing) return existing;
    const activeLoad = this.activeLoads.get(path);
    if (activeLoad) return activeLoad;
    const operation = file_info(path).then(async (info) => {
      const file =
        info.viewKind === "markdown"
          ? await file_read(path)
          : {
              content: "",
              mtime: info.mtime,
              size: info.size,
              kind: "binary" as const,
              readonly: true,
              warning: null,
            };
      const opened = $state({
        path,
        ...file,
        viewKind: info.viewKind,
        dirty: false,
        saving: false,
      });
      this.files[path] = opened;
      if (opened.warning) showToast(opened.warning, "info");
      return opened;
    });
    this.activeLoads.set(path, operation);
    try {
      return await operation;
    } finally {
      this.activeLoads.delete(path);
    }
  }

  async openFile(path: string, newTab = false, paneId?: string): Promise<void> {
    openPath(path, { newTab, paneId });
    await this.loadFile(path);
  }

  async openPdf(
    path: string,
    page = 1,
    newTab = false,
    paneId?: string,
  ): Promise<void> {
    await this.openFile(path, newTab, paneId);
    const tab = activeTab();
    if (tab?.path !== path) return;
    tab.pdfPage = Math.max(1, Math.round(page));
    scheduleWorkspaceSave();
  }

  updateContent(path: string, content: string): void {
    const file = this.files[path];
    if (
      !file ||
      file.readonly ||
      file.kind !== "text" ||
      this.updateInstallationLocked
    )
      return;
    file.content = content;
    file.dirty = true;
    this.scheduleAutosave(path);
  }

  async save(path = activeTab()?.path ?? undefined): Promise<void> {
    if (!path) return;
    const activeSave = this.activeSaves.get(path);
    if (activeSave) {
      await activeSave;
      if (this.files[path]?.dirty) await this.save(path);
      return;
    }
    const file = this.files[path];
    if (!file?.dirty) return;
    this.clearAutosave(path);
    file.saving = true;
    const content = file.content;
    const knownMtime = file.mtime;
    const operation = file_write(path, content, knownMtime).then((result) => {
      const latest = this.files[path];
      if (!latest) return;
      latest.mtime = result.mtime;
      latest.dirty = latest.content !== content;
    });
    this.activeSaves.set(path, operation);
    try {
      await operation;
    } catch (error) {
      if (errorMessage(error).startsWith("conflict:")) {
        const disk = await file_read(path);
        this.conflict = {
          path,
          mine: content,
          disk: disk.content,
          diskMtime: disk.mtime,
        };
        throw new Error("Resolve the external edit conflict before continuing");
      }
      throw error;
    } finally {
      this.activeSaves.delete(path);
      if (this.files[path]) this.files[path].saving = false;
    }
  }

  async saveAll(): Promise<void> {
    while (true) {
      const pending = Object.values(this.files).filter(
        (file) => file.dirty || file.saving || this.activeSaves.has(file.path),
      );
      if (pending.length === 0) return;
      await Promise.all(pending.map((file) => this.save(file.path)));
    }
  }

  async runEditOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.updateInstallationLocked) {
      throw new Error("Editing is paused while an update is being installed");
    }
    const pending = operation();
    this.activeEditOperations.add(pending);
    try {
      return await pending;
    } finally {
      this.activeEditOperations.delete(pending);
    }
  }

  async prepareForUpdateInstallation(): Promise<() => void> {
    if (this.updateInstallationLocked) {
      throw new Error("An update installation is already in progress");
    }
    this.updateInstallationLocked = true;
    try {
      await Promise.all([...this.activeEditOperations]);
      await this.saveAll();
      if (
        Object.values(this.files).some((file) => file.dirty || file.saving) ||
        this.activeSaves.size > 0 ||
        this.activeEditOperations.size > 0
      ) {
        throw new Error("Pending note changes could not be saved");
      }
      return () => {
        this.updateInstallationLocked = false;
      };
    } catch (error) {
      this.updateInstallationLocked = false;
      throw error;
    }
  }

  async createNote(parent = "", newTab = false): Promise<string> {
    const path = await file_create(parent);
    await this.refreshTree();
    await this.loadFile(path);
    openPath(path, { newTab });
    return path;
  }

  async createNoteAt(path: string, newTab = false): Promise<string> {
    return this.createNoteWithContent(path, "", newTab);
  }

  async createNoteWithContent(
    path: string,
    content: string,
    newTab = false,
  ): Promise<string> {
    const normalized = path.trim().replace(/^\/+/, "");
    const created = await file_create_with_content(
      normalized.toLowerCase().endsWith(".md")
        ? normalized
        : `${normalized}.md`,
      content,
    );
    await this.refreshTree();
    await this.loadFile(created);
    openPath(created, { newTab });
    return created;
  }

  replaceContent(path: string, content: string, mtime: number): void {
    const file = this.files[path];
    if (!file) return;
    this.clearAutosave(path);
    file.content = content;
    file.mtime = mtime;
    file.size = new TextEncoder().encode(content).length;
    file.dirty = false;
    file.saving = false;
  }

  async resolveConflict(choice: "mine" | "disk"): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return;
    if (choice === "mine") {
      const result = await file_write_force(conflict.path, conflict.mine);
      this.replaceContent(conflict.path, conflict.mine, result.mtime);
    } else {
      const disk = await file_read(conflict.path);
      const file = this.files[conflict.path];
      if (file) {
        Object.assign(file, disk, { dirty: false, saving: false });
      }
    }
    this.conflict = null;
  }

  async handleExternalChanges(paths: string[]): Promise<void> {
    for (const path of paths) {
      const file = this.files[path];
      if (!file || file.dirty || file.saving) continue;
      try {
        if (file.viewKind === "markdown") {
          const disk = await file_read(path);
          Object.assign(file, disk, { dirty: false, saving: false });
        } else {
          const disk = await file_info(path);
          Object.assign(file, disk, { dirty: false, saving: false });
        }
      } catch {
        // A rename/delete event is reconciled by the refreshed file tree.
      }
    }
  }

  async openWikilink(
    rawTarget: string,
    newTab = false,
    sourcePath = activeTab()?.path ?? undefined,
  ): Promise<void> {
    const target = rawTarget.split("#", 1)[0]?.trim().replace(/\.md$/i, "");
    if (!target) return;
    const matches = await search_filename(target, 100);
    const normalized = target.replace(/^\/+|\/+$/g, "").toLowerCase();
    const sourceParent = sourcePath
      ?.replace(/\.md$/i, "")
      .split("/")
      .slice(0, -1);
    const sourceRelative = [...(sourceParent ?? []), ...normalized.split("/")]
      .reduce<string[]>((parts, part) => {
        if (part === "..") parts.pop();
        else if (part && part !== ".") parts.push(part);
        return parts;
      }, [])
      .join("/");
    const exact = matches.find(
      (match) => match.path.replace(/\.md$/i, "").toLowerCase() === normalized,
    );
    const relative = matches.find(
      (match) =>
        match.path.replace(/\.md$/i, "").toLowerCase() === sourceRelative,
    );
    const filenameMatches = matches.filter((match) => {
      const identity = match.path.replace(/\.md$/i, "");
      return identity.split("/").at(-1)?.toLowerCase() === normalized;
    });
    const resolved =
      exact ??
      relative ??
      (filenameMatches.length === 1 ? filenameMatches[0] : undefined);
    if (resolved) {
      await this.openFile(resolved.path, newTab);
    } else {
      await this.createNoteAt(`${target}.md`, newTab);
    }
  }

  async createFolder(parent = ""): Promise<string> {
    const path = await folder_create(parent);
    await this.refreshTree();
    return path;
  }

  async rename(path: string, newName: string): Promise<string> {
    await this.saveAll();
    const renamed = await file_rename(path, newName);
    this.remapFiles(path, renamed);
    remapWorkspacePaths(path, renamed);
    await this.refreshTree();
    return renamed;
  }

  async move(path: string, destination: string): Promise<string> {
    await this.saveAll();
    const moved = await file_move(path, destination);
    this.remapFiles(path, moved);
    remapWorkspacePaths(path, moved);
    await this.refreshTree();
    return moved;
  }

  async addTag(path: string, tag: string): Promise<void> {
    const normalized = tag.trim().replace(/^#/, "");
    if (!normalized || !path.toLowerCase().endsWith(".md")) return;
    await this.save(path);
    const disk = this.files[path] ?? (await this.loadFile(path));
    const properties = await frontmatter_get(path);
    const existing = properties.find(
      (property) => property.key.toLowerCase() === "tags",
    );
    if (existing) {
      const tags = Array.isArray(existing.value)
        ? existing.value.map(String)
        : String(existing.value)
            .split(/[,\s]+/)
            .filter(Boolean);
      if (
        tags.some(
          (candidate) => candidate.toLowerCase() === normalized.toLowerCase(),
        )
      )
        return;
      existing.key = "tags";
      existing.valueType = "list";
      existing.value = [...tags, normalized];
    } else {
      properties.push({
        key: "tags",
        valueType: "list",
        value: [normalized],
      });
    }
    const result = await frontmatter_set(path, properties, disk.mtime);
    this.replaceContent(path, result.content, result.mtime);
  }

  async delete(path: string): Promise<void> {
    await this.saveAll();
    await file_delete(path);
    for (const openPath of Object.keys(this.files)) {
      if (this.isSameOrChild(openPath, path)) {
        this.clearAutosave(openPath);
        delete this.files[openPath];
      }
    }
    removeWorkspacePaths(path);
    await this.refreshTree();
  }

  private scheduleAutosave(path: string): void {
    this.clearAutosave(path);
    this.autosaveTimers.set(
      path,
      window.setTimeout(() => {
        void this.save(path).catch((error: unknown) =>
          showToast(errorMessage(error)),
        );
      }, 2000),
    );
  }

  private clearAutosave(path: string): void {
    const timer = this.autosaveTimers.get(path);
    if (timer !== undefined) window.clearTimeout(timer);
    this.autosaveTimers.delete(path);
  }

  private isSameOrChild(candidate: string, parent: string): boolean {
    return candidate === parent || candidate.startsWith(`${parent}/`);
  }

  private remapFiles(previous: string, next: string): void {
    for (const path of Object.keys(this.files)) {
      if (!this.isSameOrChild(path, previous)) continue;
      const file = this.files[path];
      const remapped = `${next}${path.slice(previous.length)}`;
      delete this.files[path];
      file.path = remapped;
      this.files[remapped] = file;
    }
  }
}

export const vaultState = new VaultStore();
