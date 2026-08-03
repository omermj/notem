import {
  errorMessage,
  settings_get,
  settings_set,
  type AppSettings,
} from "../api";
import { configureHotkeys } from "../commands";
import { DEFAULT_EDITOR_FONT, normalizeEditorFont } from "../editor/fonts";
import { showToast } from "./ui.svelte";
import type { UpdateCheckPreference } from "../api";

export type Theme = "light" | "dark" | "system";

export function normalizeUpdateCheckPreference(
  value: unknown,
): UpdateCheckPreference {
  return value === "automatic" || value === "manual" ? value : "unset";
}

export function normalizePersistedTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[8] ?? 0);
  const offsetMinute = Number(match[9] ?? 0);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    !daysInMonth ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 60 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

export const settingsState = $state({
  theme: "system" as Theme,
  lastVault: null as string | null,
  editorFontSize: 15,
  editorFont: DEFAULT_EDITOR_FONT,
  readableLineLength: true,
  editorLineWidth: 82,
  spellcheck: true,
  highlightActiveLine: true,
  accentColor: "#6657d9",
  dailyNotesFolder: "Daily/",
  dailyNoteDateFormat: "YYYY-MM-DD",
  dailyNoteTemplate: null as string | null,
  templatesFolder: "Templates/",
  hotkeys: {} as Record<string, string>,
  updateCheckPreference: "unset" as UpdateCheckPreference,
  lastAutomaticUpdateAttemptAt: null as string | null,
  lastSuccessfulUpdateCheckAt: null as string | null,
  dismissedUpdateVersion: null as string | null,
});

export async function loadSettings(): Promise<AppSettings> {
  const settings = await settings_get();
  settingsState.lastVault = settings.lastVault;
  settingsState.theme = settings.theme;
  settingsState.editorFontSize = settings.editorFontSize;
  settingsState.editorFont = normalizeEditorFont(settings.editorFont);
  settingsState.readableLineLength = settings.readableLineLength;
  settingsState.editorLineWidth = settings.editorLineWidth;
  settingsState.spellcheck = settings.spellcheck;
  settingsState.highlightActiveLine = settings.highlightActiveLine;
  settingsState.accentColor = settings.accentColor;
  settingsState.dailyNotesFolder = settings.dailyNotesFolder;
  settingsState.dailyNoteDateFormat = settings.dailyNoteDateFormat;
  settingsState.dailyNoteTemplate = settings.dailyNoteTemplate;
  settingsState.templatesFolder = settings.templatesFolder;
  settingsState.hotkeys = settings.hotkeys;
  settingsState.updateCheckPreference = normalizeUpdateCheckPreference(
    settings.updateCheckPreference,
  );
  settingsState.lastAutomaticUpdateAttemptAt = normalizePersistedTimestamp(
    settings.lastAutomaticUpdateAttemptAt,
  );
  settingsState.lastSuccessfulUpdateCheckAt = normalizePersistedTimestamp(
    settings.lastSuccessfulUpdateCheckAt,
  );
  settingsState.dismissedUpdateVersion = settings.dismissedUpdateVersion;
  configureHotkeys(settings.hotkeys);
  return settings;
}

export async function rememberVault(path: string): Promise<void> {
  settingsState.lastVault = path;
  await persistSettings();
}

export async function updateEditorSettings(
  editorFontSize: number,
  editorLineWidth: number,
  spellcheck: boolean,
): Promise<void> {
  settingsState.editorFontSize = Math.min(32, Math.max(10, editorFontSize));
  settingsState.editorLineWidth = Math.min(160, Math.max(40, editorLineWidth));
  settingsState.spellcheck = spellcheck;
  await persistSettings();
}

export async function toggleTheme(): Promise<void> {
  const dark = document.documentElement.dataset.theme === "dark";
  settingsState.theme = dark ? "light" : "dark";
  applyTheme();
  await persistSettings();
}

export function applyTheme(): void {
  document.documentElement.classList.add("theme-transition");
  window.setTimeout(
    () => document.documentElement.classList.remove("theme-transition"),
    180,
  );
  if (settingsState.theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = settingsState.theme;
  }
  document.documentElement.style.setProperty(
    "--color-accent",
    settingsState.accentColor,
  );
  document.documentElement.style.setProperty(
    "--color-accent-hover",
    `color-mix(in srgb, ${settingsState.accentColor} 84%, var(--color-text-strong))`,
  );
  installSystemThemeListener();
}

let systemThemeListenerInstalled = false;

function installSystemThemeListener(): void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = (): void => {
    document.documentElement.dataset.systemTheme = media.matches
      ? "dark"
      : "light";
    if (settingsState.theme === "system") {
      document.documentElement.classList.add("theme-transition");
      window.setTimeout(
        () => document.documentElement.classList.remove("theme-transition"),
        180,
      );
    }
  };
  sync();
  if (!systemThemeListenerInstalled) {
    media.addEventListener("change", sync);
    systemThemeListenerInstalled = true;
  }
}

export async function updateSettings(
  patch: Partial<Omit<AppSettings, "lastVault">>,
  options: { notifyOnError?: boolean; throwOnError?: boolean } = {},
): Promise<void> {
  Object.assign(settingsState, patch);
  if (patch.theme !== undefined || patch.accentColor !== undefined)
    applyTheme();
  if (patch.hotkeys !== undefined) configureHotkeys(settingsState.hotkeys);
  await persistSettings(
    options.notifyOnError !== false,
    options.throwOnError === true,
  );
}

export async function setHotkey(id: string, hotkey: string): Promise<void> {
  settingsState.hotkeys = { ...settingsState.hotkeys, [id]: hotkey };
  configureHotkeys(settingsState.hotkeys);
  await persistSettings();
}

export async function resetHotkey(id: string): Promise<void> {
  const hotkeys = { ...settingsState.hotkeys };
  delete hotkeys[id];
  settingsState.hotkeys = hotkeys;
  configureHotkeys(hotkeys);
  await persistSettings();
}

async function persistSettings(
  notifyOnError = true,
  throwOnError = false,
): Promise<void> {
  try {
    await settings_set({
      lastVault: settingsState.lastVault,
      theme: settingsState.theme,
      editorFontSize: settingsState.editorFontSize,
      editorFont: settingsState.editorFont,
      readableLineLength: settingsState.readableLineLength,
      editorLineWidth: settingsState.editorLineWidth,
      spellcheck: settingsState.spellcheck,
      highlightActiveLine: settingsState.highlightActiveLine,
      accentColor: settingsState.accentColor,
      dailyNotesFolder: settingsState.dailyNotesFolder,
      dailyNoteDateFormat: settingsState.dailyNoteDateFormat,
      dailyNoteTemplate: settingsState.dailyNoteTemplate,
      templatesFolder: settingsState.templatesFolder,
      hotkeys: settingsState.hotkeys,
      updateCheckPreference: settingsState.updateCheckPreference,
      lastAutomaticUpdateAttemptAt: settingsState.lastAutomaticUpdateAttemptAt,
      lastSuccessfulUpdateCheckAt: settingsState.lastSuccessfulUpdateCheckAt,
      dismissedUpdateVersion: settingsState.dismissedUpdateVersion,
    });
  } catch (error) {
    if (notifyOnError) {
      showToast(`Could not save settings: ${errorMessage(error)}`);
    }
    if (throwOnError) throw error;
  }
}
