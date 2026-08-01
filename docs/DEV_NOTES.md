# NoteM — Historical Development Companion Notes

> This file records the original implementation workflow and pitfalls. It is not a current support statement or cross-platform test report. See `README.md`, `CONTRIBUTING.md`, and `docs/PUBLIC_RELEASE_AUDIT.md` for current instructions and validation status.

## 1. Suggested Harness Workflow

- The original implementation used one phase per assistant session with a separate prompt file. That prompt file was removed before the public-history baseline.
- After the LLM finishes: run `cargo clippy`, `cargo test`, `pnpm check`, `pnpm tauri dev`, then walk the phase's acceptance checklist manually.
- Commit per phase (`feat: phase N — <name>`). Never let the LLM continue to the next phase in the same context if the diff is large — fresh context beats stale context.
- If a phase fails: paste the exact error + the acceptance item that failed; forbid rewrites of unrelated files ("modify only files needed to fix X").

## 2. Environment Setup (do this yourself once)

```bash
# Rust 1.97.1
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Node.js 22.18.0 + pnpm 11.17.0
corepack enable && corepack prepare pnpm@11.17.0 --activate
# Linux system deps (Tauri 2)
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
# macOS: xcode-select --install
# Windows: VS Build Tools (C++), WebView2 (preinstalled on Win 11)
```

## 3. Fixture Vault (create in Phase 0 — contents spec)

```
fixtures/vault/
├── Home.md            # links to [[Projects/Alpha]], [[Ideas|my ideas]], tag #index
├── Ideas.md           # frontmatter title+tags, 3 headings, #idea/raw nested tag
├── Projects/Alpha.md  # links back to [[Home]], [[Missing Note]] (unresolved), code block containing fake [[link]] and #tag that must NOT be indexed
├── Projects/Beta.md   # task list, image link, [[Alpha#Goals]] heading link
└── Daily/2026-01-01.md
```

Expected index counts (for tests): 5 files, 6 resolved links, 1 unresolved, 5 tags (code-block ones excluded).

## 4. Known Pitfalls to Watch For (paste to LLM when relevant)

- CM6 decorations: syntax hiding must use `Decoration.replace` ranges recomputed on selection change; naive re-decoration on every keystroke kills latency.
- Tauri asset protocol: image rendering needs `assetProtocol` scope configured for the vault dir (dynamic scope via `tauri-plugin-fs` or `app.asset_protocol_scope().allow_directory`).
- rusqlite + Tauri state: wrap Connection in `Mutex`; never hold the lock across `await`.
- `notify` on macOS sends duplicate events; debounce and dedupe by path.
- Windows paths: normalize `\` → `/` at the Rust boundary in ONE place.
- FTS5 external content tables are fiddly — a plain contentful FTS table is fine at this scale.
- Svelte 5 runes: stores in `.svelte.ts` files; don't mix old `writable` API with runes in the same module.

## 5. Original Definition of Done

- Validate every Phase 0–8 acceptance checklist on Linux, macOS ARM, and Windows before claiming completion.
- `cargo test` + Vitest green in CI; clippy clean.
- Cold start < 1s, 5k-file index < 3s, search < 100ms (debug command shows timings).
- Deleting `.notem/` and reopening the vault fully rebuilds state with zero data loss.
