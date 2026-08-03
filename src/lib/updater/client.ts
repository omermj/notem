import { getVersion } from "@tauri-apps/api/app";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { update_installation_capability, url_open_external } from "../api";
import { releasePageUrl } from "./types";
import type {
  UpdateDownloadEvent,
  UpdaterClient,
  UpdaterUpdate,
} from "./types";

function mapDownloadEvent(event: DownloadEvent): UpdateDownloadEvent {
  switch (event.event) {
    case "Started":
      return {
        type: "started",
        totalBytes: event.data.contentLength ?? null,
      };
    case "Progress":
      return { type: "progress", chunkBytes: event.data.chunkLength };
    case "Finished":
      return { type: "finished" };
  }
}

function mapUpdate(update: Update): UpdaterUpdate {
  return {
    version: update.version,
    notes: update.body ?? "",
    date: update.date ?? null,
    downloadAndInstall: async (onEvent) => {
      await update.downloadAndInstall((event) =>
        onEvent(mapDownloadEvent(event)),
      );
    },
    close: () => update.close(),
  };
}

export const nativeUpdaterClient: UpdaterClient = {
  getInstalledVersion: () => getVersion(),
  async checkForUpdate(): Promise<UpdaterUpdate | null> {
    const update = await check();
    return update ? mapUpdate(update) : null;
  },
  getInstallationCapability: () => update_installation_capability(),
  relaunch: () => relaunch(),
  async openReleasePage(version: string): Promise<void> {
    const url = releasePageUrl(version);
    if (!url) throw new Error("The update version is not a valid release tag");
    await url_open_external(url);
  },
};
