# AGENTS.md — NoteM

## Project Overview

NoteM is a lightweight, local-first, cross-platform (Linux, macOS ARM, Windows) Markdown knowledge-base app. The vault is a plain folder of `.md` files. All indexes are derived, disposable caches. No cloud, no account, no telemetry.

## Tech Stack (fixed — do not substitute)

| Layer           | Choice                                 | Notes                                                             |
| --------------- | -------------------------------------- | ----------------------------------------------------------------- |
| App shell       | Tauri 2 (Rust, stable)                 | Single binary per platform                                        |
| Frontend        | Svelte 5 + TypeScript + Vite           | Use runes ($state, $derived, $effect)                             |
| Editor          | CodeMirror 6                           | `@codemirror/lang-markdown`, custom decorations for live preview  |
| Markdown render | markdown-it (reading view)             | Plugins: wikilinks (custom), tags (custom), footnotes, task lists |
| Index/DB        | SQLite via `rusqlite` (bundled) + FTS5 | Stored at `<vault>/.notem/index.db`                               |
| File watching   | `notify` crate (debounced 300ms)       | Rust side only                                                    |
| Graph view      | d3-force + Canvas rendering            | No SVG for graphs (perf)                                          |
| State (UI)      | Svelte stores/runes only               | No Redux-like libs                                                |
| Styling         | Plain CSS with CSS custom properties   | Theming via variables; no Tailwind                                |
| Package manager | pnpm                                   |                                                                   |

## Repository Layout

```
notem/
├── AGENTS.md
├── package.json / pnpm-lock.yaml
├── vite.config.ts
├── src/                      # Svelte frontend
│   ├── main.ts
│   ├── App.svelte
│   ├── lib/
│   │   ├── api.ts            # ALL invoke() calls wrapped here — only file allowed to call invoke
│   │   ├── stores/           # vault.svelte.ts, ui.svelte.ts, settings.svelte.ts
│   │   ├── editor/           # CodeMirror setup, extensions, live-preview decorations
│   │   ├── components/       # FileExplorer, TabBar, SearchPane, BacklinksPane, TagPane, Outline, GraphView, CommandPalette, QuickSwitcher, StatusBar, Modal
│   │   └── markdown/         # markdown-it config, wikilink & tag plugins
│   └── styles/               # base.css, themes/light.css, themes/dark.css
├── src-tauri/
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── commands/         # vault.rs, files.rs, search.rs, links.rs, tags.rs, settings.rs
│       ├── index/            # db.rs (schema+migrations), parser.rs (md scanning), watcher.rs
│       └── error.rs          # single AppError type, thiserror
└── tests/                    # Rust integration tests live in src-tauri/tests/
```

## Architecture Rules (non-negotiable)

1. **Files are the database.** Never store note content in SQLite — only derived metadata (paths, links, tags, headings, FTS index). Deleting `.notem/` must be fully recoverable by re-indexing.
2. **All FS and index operations happen in Rust.** Frontend never touches the filesystem directly; it calls Tauri commands via `src/lib/api.ts`.
3. **Event-driven sync.** Rust watcher detects external changes → re-indexes changed file → emits `notem://file-changed`, `notem://index-updated` events → frontend updates stores.
4. **Paths:** vault-relative, forward slashes, always. Convert at the Rust boundary. Note identity = vault-relative path without `.md` extension.
5. **Wikilink resolution:** `[[Name]]` resolves case-insensitively to (a) exact relative path, (b) unique filename match anywhere in vault, (c) unresolved (render as dashed "unresolved" link that creates the note on click).
6. **Errors:** Rust commands return `Result<T, AppError>`; frontend shows toast notifications, never crashes.
7. **Performance targets:** cold start < 1s; open 5k-file vault index < 3s; typing latency < 16ms; search < 100ms.

## SQLite Schema (create in Phase 2, do not deviate)

```sql
CREATE TABLE files(id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, title TEXT, mtime INTEGER, size INTEGER);
CREATE TABLE links(id INTEGER PRIMARY KEY, source_id INTEGER REFERENCES files(id) ON DELETE CASCADE, target_path TEXT NOT NULL, target_id INTEGER NULL, display TEXT, pos INTEGER);
CREATE TABLE tags(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, tag TEXT NOT NULL);
CREATE TABLE headings(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, level INTEGER, text TEXT, line INTEGER);
CREATE TABLE frontmatter(id INTEGER PRIMARY KEY, file_id INTEGER REFERENCES files(id) ON DELETE CASCADE, key TEXT, value TEXT);
CREATE VIRTUAL TABLE fts USING fts5(path, title, body, tokenize='porter unicode61');
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); -- schema_version, etc.
```

## Tauri Command Naming

Snake_case, grouped by module: `vault_open`, `vault_list`, `file_read`, `file_write`, `file_create`, `file_rename`, `file_delete`, `file_move`, `search_fts`, `search_filename`, `links_backlinks`, `links_graph`, `tags_all`, `settings_get`, `settings_set`, `index_rebuild`.

## Coding Conventions

- Rust: `rustfmt` defaults, `clippy` clean, `thiserror` for errors, no `unwrap()` in command handlers.
- TS: strict mode, no `any`, ESLint + Prettier defaults.
- Svelte: one component per file; components < 300 lines; business logic in stores, not components.
- Commits: conventional commits (`feat:`, `fix:`, `refactor:`).
- Every phase must compile (`pnpm tauri dev` works) and pass `cargo test` before it is considered done.

## Settings

App settings JSON at platform config dir (`tauri-plugin-store` or manual): last vault path, theme, editor prefs. Vault-specific settings at `<vault>/.notem/settings.json`.

## Testing

- Rust: unit tests for parser (wikilinks/tags/headings/frontmatter extraction), integration tests for indexer against a fixture vault in `src-tauri/tests/fixtures/vault/`.
- Frontend: keep logic testable in pure TS modules; Vitest for `markdown/` and store logic.
- Record platform-specific manual validation in the pull request and release checklist.

## Out of Scope (do NOT build)

Sync/cloud, plugins marketplace, mobile, collaborative editing, PDF export (until told), encryption.
