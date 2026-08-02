import { describe, expect, it, vi } from "vitest";
import { createUpdaterStore } from "./updater.svelte";
import type {
  UpdateDownloadEvent,
  UpdaterClient,
  UpdaterUpdate,
} from "../updater/types";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

function fakeUpdate(
  version = "v1.2.3",
  download?: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>,
): UpdaterUpdate {
  return {
    version,
    notes: "<not-rendered> release notes",
    date: "2026-08-02T12:00:00.000Z",
    downloadAndInstall:
      download ??
      (async () => {
        // No-op download for check-only tests.
      }),
    close: vi.fn(async () => undefined),
  };
}

function fakeClient(
  checkForUpdate: UpdaterClient["checkForUpdate"],
  capability: "automatic" | "manualDownloadOnly" = "automatic",
): UpdaterClient & { openReleasePage: ReturnType<typeof vi.fn> } {
  return {
    getInstalledVersion: vi.fn(async () => "1.0.0"),
    checkForUpdate,
    getInstallationCapability: vi.fn(async () => ({ mode: capability })),
    relaunch: vi.fn(async () => undefined),
    openReleasePage: vi.fn(async () => undefined),
  };
}

function makeStore(client: UpdaterClient) {
  return createUpdaterStore({
    client,
    now: () => "2026-08-02T12:00:00.000Z",
    persistSettings: vi.fn(async () => undefined),
    getDismissedUpdateVersion: () => null,
  });
}

describe("updater store", () => {
  it("loads the installed application version through the injected client", async () => {
    const client = fakeClient(async () => null);
    const store = makeStore(client);

    expect(await store.loadInstalledVersion()).toBe("1.0.0");
    expect(await store.loadInstalledVersion()).toBe("1.0.0");
    expect(client.getInstalledVersion).toHaveBeenCalledOnce();
  });

  it("prevents simultaneous checks", async () => {
    const gate = deferred<UpdaterUpdate | null>();
    let checkCalls = 0;
    const client = fakeClient(async () => {
      checkCalls += 1;
      return gate.promise;
    });
    const store = makeStore(client);

    const first = store.checkForUpdateManually();
    const second = store.checkForUpdateInBackground();
    await Promise.resolve();
    gate.resolve(null);

    expect(await first).toMatchObject({
      started: true,
      source: "manual",
      status: "upToDate",
    });
    expect(await second).toMatchObject({
      started: true,
      source: "manual",
      status: "upToDate",
    });
    expect(checkCalls).toBe(1);
  });

  it("keeps manual and background errors distinguishable without showing UI", async () => {
    const client = fakeClient(async () => {
      throw new Error("offline");
    });
    const store = makeStore(client);

    const manual = await store.checkForUpdateManually();
    expect(manual).toMatchObject({
      source: "manual",
      status: "error",
      error: "offline",
    });
    expect(store.state.errorSource).toBe("manual");

    const background = await store.checkForUpdateInBackground();
    expect(background).toMatchObject({
      source: "background",
      status: "error",
      error: "offline",
    });
    expect(store.state.errorSource).toBe("background");
  });

  it("stores a plain-text update-available result", async () => {
    const client = fakeClient(async () => fakeUpdate());
    const store = makeStore(client);

    const result = await store.checkForUpdateManually();

    expect(result.status).toBe("available");
    expect(store.state.status).toBe("available");
    expect(store.state.availableVersion).toBe("1.2.3");
    expect(store.state.releaseNotes).toBe("<not-rendered> release notes");
  });

  it("reports the no-update state", async () => {
    const client = fakeClient(async () => null);
    const store = makeStore(client);

    const result = await store.checkForUpdateInBackground();

    expect(result.status).toBe("upToDate");
    expect(store.state.status).toBe("upToDate");
    expect(store.state.availableVersion).toBeNull();
  });

  it.each([
    {
      name: "known content length",
      totalBytes: 100,
      expected: { downloadedBytes: 100, totalBytes: 100 },
    },
    {
      name: "unknown content length",
      totalBytes: null,
      expected: { downloadedBytes: 100, totalBytes: null },
    },
  ])("tracks progress with $name", async ({ totalBytes, expected }) => {
    const client = fakeClient(async () =>
      fakeUpdate("1.2.3", async (onEvent) => {
        onEvent({ type: "started", totalBytes });
        onEvent({ type: "progress", chunkBytes: 40 });
        onEvent({ type: "progress", chunkBytes: 60 });
        onEvent({ type: "finished" });
      }),
    );
    const store = makeStore(client);

    await store.checkForUpdateManually();
    await store.installAvailableUpdate();

    expect(store.state.progress).toEqual(expected);
    expect(store.state.status).toBe("installing");
    expect(client.relaunch).toHaveBeenCalledOnce();
  });

  it("opens the release page instead of installing on manual-only platforms", async () => {
    const client = fakeClient(async () => fakeUpdate(), "manualDownloadOnly");
    const store = makeStore(client);

    await store.checkForUpdateManually();
    await store.installAvailableUpdate();

    expect(store.state.status).toBe("manualDownloadRequired");
    expect(client.openReleasePage).toHaveBeenCalledWith("1.2.3");
    expect(client.relaunch).not.toHaveBeenCalled();
  });
});
