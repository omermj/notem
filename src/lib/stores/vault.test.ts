import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  file_create: vi.fn(),
  file_create_with_content: vi.fn(),
  file_delete: vi.fn(),
  file_info: vi.fn(),
  file_move: vi.fn(),
  file_read: vi.fn(),
  file_rename: vi.fn(),
  file_write: vi.fn(),
  file_write_force: vi.fn(),
  folder_create: vi.fn(),
  frontmatter_get: vi.fn(),
  frontmatter_set: vi.fn(),
  search_filename: vi.fn(),
  vault_list: vi.fn(),
  vault_open: vi.fn(),
}));

vi.mock("./ui.svelte", () => ({
  activeTab: vi.fn(() => null),
  openPath: vi.fn(),
  remapWorkspacePaths: vi.fn(),
  removeWorkspacePaths: vi.fn(),
  scheduleWorkspaceSave: vi.fn(),
  showToast: vi.fn(),
}));

import { file_write } from "../api";
import { VaultStore, type OpenFile } from "./vault.svelte";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function openFile(content: string): OpenFile {
  return {
    path: "Note.md",
    content,
    mtime: 1,
    dirty: true,
    saving: false,
    size: content.length,
    kind: "text",
    readonly: false,
    warning: null,
    viewKind: "markdown",
  };
}

describe("vault update installation preparation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drains an edit made while the prior save is in flight", async () => {
    const firstWrite = deferred<{ mtime: number }>();
    vi.mocked(file_write)
      .mockImplementationOnce(async () => firstWrite.promise)
      .mockResolvedValueOnce({ mtime: 3 });
    const store = new VaultStore();
    store.files["Note.md"] = openFile("first");

    const saving = store.saveAll();
    await vi.waitFor(() => expect(file_write).toHaveBeenCalledOnce());
    store.files["Note.md"].content = "second";
    store.files["Note.md"].dirty = true;
    firstWrite.resolve({ mtime: 2 });
    await saving;

    expect(file_write).toHaveBeenNthCalledWith(1, "Note.md", "first", 1);
    expect(file_write).toHaveBeenNthCalledWith(2, "Note.md", "second", 2);
    expect(store.files["Note.md"].dirty).toBe(false);
  });

  it("locks editing before the save starts and unlocks on failure", async () => {
    const write = deferred<{ mtime: number }>();
    vi.mocked(file_write).mockImplementationOnce(async () => write.promise);
    const store = new VaultStore();
    store.files["Note.md"] = openFile("pending");

    const preparing = store.prepareForUpdateInstallation();
    expect(store.updateInstallationLocked).toBe(true);
    store.updateContent("Note.md", "must not be accepted");
    expect(store.files["Note.md"].content).toBe("pending");
    write.reject(new Error("disk full"));

    await expect(preparing).rejects.toThrow("disk full");
    expect(store.updateInstallationLocked).toBe(false);
  });

  it("keeps editing locked until the installer releases it", async () => {
    vi.mocked(file_write).mockResolvedValue({ mtime: 2 });
    const store = new VaultStore();
    store.files["Note.md"] = openFile("pending");

    const release = await store.prepareForUpdateInstallation();

    expect(store.files["Note.md"].dirty).toBe(false);
    expect(store.updateInstallationLocked).toBe(true);
    release();
    expect(store.updateInstallationLocked).toBe(false);
  });
});
