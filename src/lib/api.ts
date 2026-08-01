import { invoke } from "@tauri-apps/api/core";
import type { EditorFont } from "./editor/fonts";

type InvokeArguments = Record<string, unknown>;

function invokeCommand<T>(command: string, args?: InvokeArguments): Promise<T> {
  return invoke<T>(command, args);
}

export type VaultEntryKind = "folder" | "file";

export interface VaultEntry {
  name: string;
  path: string;
  kind: VaultEntryKind;
  children: VaultEntry[];
}

export interface VaultInfo {
  path: string;
  name: string;
}

export interface FileContents {
  content: string;
  mtime: number;
  size: number;
  kind: "text" | "binary";
  readonly: boolean;
  warning: string | null;
}

export interface FileInfo {
  mtime: number;
  size: number;
  viewKind: "markdown" | "pdf" | "binary";
  readonly: boolean;
}

export interface FileWriteResult {
  mtime: number;
}

export interface ImportedAttachment {
  vaultPath: string;
  markdownPath: string;
  mediaType: string;
  isImage: boolean;
}

export interface AttachmentResolution {
  status: "resolved" | "ambiguous" | "unresolved";
  path: string | null;
}

export interface AppSettings {
  lastVault: string | null;
  theme: "light" | "dark" | "system";
  editorFontSize: number;
  editorFont: EditorFont;
  readableLineLength: boolean;
  editorLineWidth: number;
  spellcheck: boolean;
  highlightActiveLine: boolean;
  accentColor: string;
  dailyNotesFolder: string;
  dailyNoteDateFormat: string;
  dailyNoteTemplate: string | null;
  templatesFolder: string;
  hotkeys: Record<string, string>;
}

export type PropertyValueType =
  "text" | "number" | "checkbox" | "date" | "list";

export interface PropertyEntry {
  key: string;
  valueType: PropertyValueType;
  value: string | number | boolean | string[];
}

export interface FilenameMatch {
  path: string;
  title: string;
}

export interface SearchMatch {
  path: string;
  title: string;
  snippet: string;
  line: number;
  score: number;
}

export interface BacklinkMention {
  path: string;
  snippet: string;
  line: number;
  start: number;
  end: number;
  text: string;
}

export interface Backlinks {
  linked: BacklinkMention[];
  unlinked: BacklinkMention[];
}

export interface GraphNode {
  id: string;
  title: string;
  linksCount: number;
  ghost: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface DebugTimings {
  frontendReadyMs: number;
  vaultOpenMs: number;
  indexMs: number;
  searchMs: number;
  typingAverageMs: number;
  typingMaxMs: number;
  indexedFiles: number;
  coldStartTargetMet: boolean;
  indexTargetMet: boolean;
  searchTargetMet: boolean;
  typingTargetMet: boolean;
}

export interface StartupFile {
  vault: string;
  path: string;
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

export function vault_open(path: string): Promise<VaultInfo> {
  return invokeCommand("vault_open", { path });
}

export function vault_list(): Promise<VaultEntry[]> {
  return invokeCommand("vault_list");
}

export function file_read(path: string): Promise<FileContents> {
  return invokeCommand("file_read", { path });
}

export function file_info(path: string): Promise<FileInfo> {
  return invokeCommand("file_info", { path });
}

export function file_write(
  path: string,
  content: string,
  knownMtime: number,
): Promise<FileWriteResult> {
  return invokeCommand("file_write", { path, content, knownMtime });
}

export function file_write_force(
  path: string,
  content: string,
): Promise<FileWriteResult> {
  return invokeCommand("file_write_force", { path, content });
}

export function file_create(path: string): Promise<string> {
  return invokeCommand("file_create", { path });
}

export function file_create_at(path: string): Promise<string> {
  return invokeCommand("file_create_at", { path });
}

export function file_create_with_content(
  path: string,
  content: string,
): Promise<string> {
  return invokeCommand("file_create_with_content", { path, content });
}

export function attachment_import(
  sourcePath: string,
  notePath: string,
): Promise<ImportedAttachment> {
  return invokeCommand("attachment_import", { sourcePath, notePath });
}

export function attachment_import_bytes(
  notePath: string,
  fileName: string,
  bytes: number[],
): Promise<ImportedAttachment> {
  return invokeCommand("attachment_import_bytes", {
    notePath,
    fileName,
    bytes,
  });
}

export function attachment_resolve(
  sourcePath: string,
  target: string,
): Promise<AttachmentResolution> {
  return invokeCommand("attachment_resolve", { sourcePath, target });
}

export function path_import(
  sourcePaths: string[],
  destination: string,
): Promise<string[]> {
  return invokeCommand("path_import", { sourcePaths, destination });
}

export function folder_create(path: string): Promise<string> {
  return invokeCommand("folder_create", { path });
}

export function file_rename(path: string, newName: string): Promise<string> {
  return invokeCommand("file_rename", { path, newName });
}

export function file_delete(path: string): Promise<void> {
  return invokeCommand("file_delete", { path });
}

export function file_move(path: string, destination: string): Promise<string> {
  return invokeCommand("file_move", { path, destination });
}

export function file_reveal(path: string): Promise<void> {
  return invokeCommand("file_reveal", { path });
}

export function file_open_external(path: string): Promise<void> {
  return invokeCommand("file_open_external", { path });
}

export function url_open_external(url: string): Promise<void> {
  return invokeCommand("url_open_external", { url });
}

export function search_fts(query: string, limit = 100): Promise<SearchMatch[]> {
  return invokeCommand("search_fts", { query, limit });
}

export function search_filename(
  query: string,
  limit = 50,
): Promise<FilenameMatch[]> {
  return invokeCommand("search_filename", { query, limit });
}

export function links_backlinks(path: string): Promise<Backlinks> {
  return invokeCommand("links_backlinks", { path });
}

export function links_link_unlinked(
  sourcePath: string,
  start: number,
  end: number,
  expectedText: string,
): Promise<void> {
  return invokeCommand("links_link_unlinked", {
    sourcePath,
    start,
    end,
    expectedText,
  });
}

export function links_graph(): Promise<LinkGraph> {
  return invokeCommand("links_graph");
}

export function tags_all(): Promise<TagCount[]> {
  return invokeCommand("tags_all");
}

export function outline_headings(path: string): Promise<Heading[]> {
  return invokeCommand("outline_headings", { path });
}

export function outline_move(
  path: string,
  fromLine: number,
  toLine: number,
  after: boolean,
  knownMtime: number,
): Promise<FileContents> {
  return invokeCommand("outline_move", {
    path,
    fromLine,
    toLine,
    after,
    knownMtime,
  });
}

export function settings_get(): Promise<AppSettings> {
  return invokeCommand("settings_get");
}

export function settings_set(settings: AppSettings): Promise<void> {
  return invokeCommand("settings_set", { settings });
}

export function vault_settings_get(): Promise<Record<string, unknown>> {
  return invokeCommand("vault_settings_get");
}

export function vault_settings_set(
  settings: Record<string, unknown>,
): Promise<void> {
  return invokeCommand("vault_settings_set", { settings });
}

export function window_open_note(path: string): Promise<void> {
  return invokeCommand("window_open_note", { path });
}

export function frontmatter_get(path: string): Promise<PropertyEntry[]> {
  return invokeCommand("frontmatter_get", { path });
}

export function frontmatter_set(
  path: string,
  properties: PropertyEntry[],
  knownMtime: number,
): Promise<FileContents> {
  return invokeCommand("frontmatter_set", { path, properties, knownMtime });
}

export function index_rebuild(): Promise<string[]> {
  return invokeCommand("index_rebuild");
}

export function debug_frontend_ready(startupMs: number): Promise<void> {
  return invokeCommand("debug_frontend_ready", { startupMs });
}

export function debug_timings(
  typingAverageMs: number,
  typingMaxMs: number,
): Promise<DebugTimings> {
  return invokeCommand("debug_timings", { typingAverageMs, typingMaxMs });
}

export function startup_file(): Promise<StartupFile | null> {
  return invokeCommand("startup_file");
}
