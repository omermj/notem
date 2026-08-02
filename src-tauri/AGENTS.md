# Rust and Tauri guidance

These rules apply to the Rust backend, Tauri configuration, capabilities, and Rust tests under `src-tauri/`.

## Security and architecture

- Preserve the minimal-capability model. Grant a permission only to the window that requires it; the primary `main` window and detached `note-*` windows intentionally have different capabilities.
- Never grant new permissions to `note-*` windows without a documented requirement and a corresponding security review.
- Do not loosen the production CSP to make functionality implemented through native Tauri plugins work. Fix the native integration or its narrow adapter instead, and update the threat model when a boundary changes.
- Never commit, print, fixture, log, or otherwise expose signing keys, tokens, credentials, or other secrets.
- Preserve path validation, vault containment, symlink protections, and the assumption that vault contents are untrusted input. Read `docs/THREAT_MODEL.md` before changing filesystem, rendering, URL, IPC, capability, or CSP behavior.

## Rust implementation rules

- Keep command handlers fallible through `Result<T, AppError>`. Avoid panics and do not use `unwrap()` in command handlers.
- Keep Markdown files authoritative and SQLite derived. File mutations and watcher updates must preserve the existing index and event consistency model.
- Add backward-compatible Serde defaults for persisted application or vault settings so older settings files continue to load safely.
- Keep the Tauri command surface grouped by responsibility and use the existing snake_case naming conventions.

## Validation

For Rust or Tauri changes, run formatting, tests, and Clippy before handoff:

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Add or update focused parser, containment, indexer, command, or integration tests for behavior changes. Do not claim native-platform validation unless it was actually run.
