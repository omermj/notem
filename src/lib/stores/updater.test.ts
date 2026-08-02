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
    checkForUpdate: vi.fn(checkForUpdate),
    getInstallationCapability: vi.fn(async () => ({
      mode: capability,
      relaunchAfterInstall: true,
    })),
    relaunch: vi.fn(async () => undefined),
    openReleasePage: vi.fn(async () => undefined),
  };
}

function makeStore(
  client: UpdaterClient,
  options: {
    preference?: "automatic" | "manual" | "unset";
    lastAttemptAt?: string | null;
    dismissedVersion?: string | null;
    prepareForInstallation?: () => Promise<void>;
  } = {},
) {
  return createUpdaterStore({
    client,
    now: () => "2026-08-02T12:00:00.000Z",
    persistSettings: vi.fn(async () => undefined),
    getUpdateCheckPreference: () => options.preference ?? "automatic",
    getLastAutomaticUpdateAttemptAt: () => options.lastAttemptAt ?? null,
    getDismissedUpdateVersion: () => options.dismissedVersion ?? null,
    prepareForInstallation: options.prepareForInstallation,
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
      error:
        "Could not reach GitHub to check for updates. Check your internet connection and try again.",
    });
    expect(store.state.errorSource).toBe("manual");

    const background = await store.checkForUpdateInBackground();
    expect(background).toMatchObject({
      source: "background",
      status: "error",
      error:
        "Could not reach GitHub to check for updates. Check your internet connection and try again.",
    });
    expect(store.state.errorSource).toBe("background");
  });

  it("does not run a background check for manual-only or unset preferences", async () => {
    const client = fakeClient(async () => fakeUpdate());
    const manualStore = makeStore(client, { preference: "manual" });
    const unsetStore = makeStore(client, { preference: "unset" });

    expect(await manualStore.checkForUpdateInBackground()).toMatchObject({
      started: false,
      status: "skipped",
    });
    expect(await unsetStore.checkForUpdateInBackground()).toMatchObject({
      started: false,
      status: "skipped",
    });
    expect(client.checkForUpdate).not.toHaveBeenCalled();
  });

  it("throttles automatic checks for a rolling 24 hours", async () => {
    const client = fakeClient(async () => fakeUpdate());
    const store = makeStore(client, {
      lastAttemptAt: "2026-08-01T12:00:00.001Z",
    });

    const result = await store.checkForUpdateInBackground();

    expect(result).toMatchObject({ started: false, status: "skipped" });
    expect(client.checkForUpdate).not.toHaveBeenCalled();
  });

  it("lets a manual check bypass the automatic throttle", async () => {
    const client = fakeClient(async () => null);
    const store = makeStore(client, {
      lastAttemptAt: "2026-08-02T11:59:59.999Z",
    });

    expect(await store.checkForUpdateInBackground()).toMatchObject({
      started: false,
      status: "skipped",
    });
    expect(await store.checkForUpdateManually()).toMatchObject({
      started: true,
      status: "upToDate",
    });
    expect(client.checkForUpdate).toHaveBeenCalledOnce();
  });

  it.each(["not-a-timestamp", "2026-08-03T12:00:00.000Z"])(
    "ignores invalid or future automatic timestamps: %s",
    async (lastAttemptAt) => {
      const client = fakeClient(async () => null);
      const store = makeStore(client, { lastAttemptAt });

      const result = await store.checkForUpdateInBackground();

      expect(result.status).toBe("upToDate");
      expect(client.checkForUpdate).toHaveBeenCalledOnce();
    },
  );

  it("records a background attempt before starting the network request", async () => {
    const events: string[] = [];
    const client = fakeClient(async () => {
      events.push("request");
      return null;
    });
    const persistSettings = vi.fn(async () => {
      events.push("persist");
    });
    const store = createUpdaterStore({
      client,
      now: () => "2026-08-02T12:00:00.000Z",
      getUpdateCheckPreference: () => "automatic",
      getLastAutomaticUpdateAttemptAt: () => null,
      persistSettings,
    });

    await store.checkForUpdateInBackground();

    expect(events).toEqual(["persist", "request", "persist"]);
    expect(persistSettings).toHaveBeenNthCalledWith(1, {
      lastAutomaticUpdateAttemptAt: "2026-08-02T12:00:00.000Z",
    });
  });

  it("does not start a background request when recording its attempt fails", async () => {
    const client = fakeClient(async () => null);
    const persistSettings = vi.fn(async () => {
      throw new Error("settings unavailable");
    });
    const store = createUpdaterStore({
      client,
      now: () => "2026-08-02T12:00:00.000Z",
      getUpdateCheckPreference: () => "automatic",
      getLastAutomaticUpdateAttemptAt: () => null,
      persistSettings,
    });

    const result = await store.checkForUpdateInBackground();

    expect(result.status).toBe("error");
    expect(client.checkForUpdate).not.toHaveBeenCalled();
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

  it("suppresses a dismissed version but resurfaces a newer version", async () => {
    let dismissedVersion: string | null = "1.2.3";
    const client = fakeClient(
      vi
        .fn()
        .mockResolvedValueOnce(fakeUpdate("1.2.3"))
        .mockResolvedValueOnce(fakeUpdate("1.2.4")),
    );
    const store = createUpdaterStore({
      client,
      now: () => "2026-08-02T12:00:00.000Z",
      getDismissedUpdateVersion: () => dismissedVersion,
      persistSettings: vi.fn(async () => undefined),
    });

    expect((await store.checkForUpdateManually()).status).toBe("upToDate");
    dismissedVersion = "1.2.3";
    expect((await store.checkForUpdateManually()).status).toBe("available");
    expect(store.state.availableVersion).toBe("1.2.4");
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

  it("blocks installation when pending note changes cannot be saved", async () => {
    const downloadAndInstall = vi.fn(async () => undefined);
    const client = fakeClient(async () =>
      fakeUpdate("1.2.3", downloadAndInstall),
    );
    const store = makeStore(client, {
      prepareForInstallation: async () => {
        throw new Error("conflict: note changed on disk");
      },
    });

    await store.checkForUpdateManually();
    await store.installAvailableUpdate();

    expect(downloadAndInstall).not.toHaveBeenCalled();
    expect(store.state.error).toBe(
      "NoteM could not safely save your pending note changes, so the update was not installed.",
    );
  });

  it("prevents repeated install clicks from starting concurrent downloads", async () => {
    const gate = deferred<void>();
    const downloadAndInstall = vi.fn(async () => gate.promise);
    const client = fakeClient(async () =>
      fakeUpdate("1.2.3", downloadAndInstall),
    );
    const store = makeStore(client);

    await store.checkForUpdateManually();
    const first = store.installAvailableUpdate();
    const second = store.installAvailableUpdate();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(downloadAndInstall).toHaveBeenCalledOnce();
    gate.resolve();
    await Promise.all([first, second]);
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

  it("does not relaunch when the native installer owns process shutdown", async () => {
    const client = fakeClient(async () => fakeUpdate());
    client.getInstallationCapability = vi.fn(async () => ({
      mode: "automatic" as const,
      relaunchAfterInstall: false,
    }));
    const store = makeStore(client);

    await store.checkForUpdateManually();
    await store.installAvailableUpdate();

    expect(client.relaunch).not.toHaveBeenCalled();
  });
});
