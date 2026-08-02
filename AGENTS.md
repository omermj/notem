# NoteM repository guidance

NoteM is a local-first Tauri 2 desktop application for a folder of Markdown notes. It has no account, cloud sync, telemetry, or intentional remote application content.

## Repository map

```text
src/                         Svelte 5 + TypeScript frontend
  App.svelte                 application shell and workspace composition
  lib/api.ts                 typed Tauri command wrappers; the invoke boundary
  lib/stores/                vault, UI, graph, and settings state
  lib/components/            focused UI components
  lib/editor/                CodeMirror 6 setup and live preview
  lib/markdown/              markdown-it rendering and extensions
  styles/                    plain CSS themes and shared variables
src-tauri/                   Rust backend and Tauri configuration
  src/commands/              IPC command handlers
  src/index/                 SQLite schema, parser, scans, and watcher
  src/vault_path.rs            filesystem containment boundary
  capabilities/              window-scoped Tauri permissions
  tests/                      Rust integration and performance tests
docs/                        architecture, threat model, and release guidance
.github/workflows/           CI, native validation, and draft-release automation
scripts/                     repository validation utilities
```

The core stack is fixed: Rust and Tauri 2, Svelte 5, strict TypeScript, Vite, CodeMirror 6, markdown-it, bundled rusqlite with FTS5, d3-force with Canvas rendering, plain CSS, and pnpm.

## Stable invariants

- Markdown notes and vault attachments are the durable source of truth. SQLite stores only disposable derived metadata and FTS content; deleting `.notem/` must leave source notes intact and allow the index to be rebuilt. Vault-specific workspace settings may also live in `.notem/settings.json`.
- Filesystem and index operations happen in Rust. Frontend code does not access the filesystem directly, and frontend Tauri `invoke()` calls are routed through `src/lib/api.ts`.
- Vault paths are relative, use `/` on every platform, and are validated at the Rust boundary. Note identity is the vault-relative path without `.md`.
- External file changes are re-indexed by the Rust watcher and surfaced through `notem://` events. Frontend state refreshes from those events rather than treating SQLite as authoritative.
- Wikilinks resolve case-insensitively by exact relative path, then by a unique filename match; unresolved links remain visibly unresolved and can create the note when activated.
- Rust command handlers return `Result<T, AppError>` and remain Clippy-clean; command handlers must not use `unwrap()`. Frontend failures become user-visible notifications rather than crashes.
- Preserve the existing performance targets: cold start under 1 second, opening a 5,000-file vault index under 3 seconds, typing latency under 16 ms, and search under 100 ms.
- Do not add cloud sync, accounts, telemetry, mobile, collaborative editing, encryption, or other unrelated product features.

## Documentation map

Read the applicable documents before editing across a boundary:

| Change                                                  | Read first                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| Architecture or data-flow changes                       | `docs/ARCHITECTURE.md`, `CONTRIBUTING.md`                                   |
| Security, IPC, URL handling, CSP, or Tauri capabilities | `docs/THREAT_MODEL.md`, `docs/ARCHITECTURE.md`, and the nearest `AGENTS.md` |
| Network behavior or privacy                             | `PRIVACY.md`, `docs/THREAT_MODEL.md`                                        |
| Releases or GitHub Actions                              | `docs/RELEASING.md`, `.github/AGENTS.md`, and the affected workflow         |
| Contributor-facing instructions or policy               | `CONTRIBUTING.md`, `README.md`, and the affected policy document            |

## Task protocol

1. Inspect existing patterns before editing.
2. Keep the change scoped to the requested feature.
3. Use targeted tests while iterating.
4. Run the appropriate complete local gate before declaring the task finished.
5. Do not claim native-platform validation that was not actually performed.
6. Do not push, publish releases, modify repository settings, or expose secrets unless explicitly instructed.
7. End with changed files, tests run, failures or omissions, and remaining manual validation.

Use the nearest nested `AGENTS.md` for frontend, Rust/Tauri, and GitHub-specific rules. For documentation-only changes, run the repository’s applicable documentation formatting check; for code or workflow changes, use the complete gate documented in `CONTRIBUTING.md` and the relevant workflow.
