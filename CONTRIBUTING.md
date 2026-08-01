# Contributing to NoteM

Thank you for considering a contribution. NoteM is a local-first desktop application: changes that touch vault files, indexing, rendered content, or Tauri IPC can affect user data and deserve especially careful review.

## Before starting

- Search existing issues before opening a new one.
- Open an issue before undertaking a large feature, architecture change, dependency replacement, or user-visible format change.
- Report vulnerabilities through [SECURITY.md](SECURITY.md), never through a public issue.
- Keep changes focused. Unrelated refactors make filesystem and security review harder.

## Development setup

Install:

- Rust 1.97.1 with `rustfmt` and `clippy`.
- Node.js 22.18.0.
- pnpm 11.17.0 through Corepack.
- The [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

From the repository root:

```sh
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
pnpm tauri dev
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), and `AGENTS.md` before changing cross-boundary behavior.

## Architecture constraints

- Markdown files are the source of truth. SQLite stores only disposable derived metadata and FTS content.
- Frontend code does not access the filesystem directly. All Tauri invocations are wrapped by `src/lib/api.ts`.
- Paths crossing IPC are vault-relative, use forward slashes, and must be resolved by the Rust containment layer.
- Watcher events update the index in Rust and notify the frontend through `notem://` events.
- Command handlers return structured errors rather than panicking; do not use `unwrap()` in handlers.
- Preserve the local-only, no-account, no-telemetry design unless a separately reviewed proposal explicitly changes it.

## Code style

- Use Svelte 5 runes and TypeScript strict mode. Keep business logic outside large components where practical.
- Use plain CSS and existing theme variables; `pnpm audit:theme` must pass.
- Follow `rustfmt` defaults and keep Clippy clean with warnings denied.
- Use conventional commit subjects such as `feat:`, `fix:`, `docs:`, `test:`, and `refactor:`.
- Do not edit generated bundles under `dist/` or Rust build output under `src-tauri/target/`.

## Tests and validation

Run before submitting:

```sh
pnpm format:check
pnpm check
pnpm lint
pnpm test
pnpm audit:theme
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Add regression tests for behavior changes. Filesystem/index changes normally require Rust tests; editor, Markdown, navigation, and store logic normally require Vitest coverage. Use only synthetic notes, paths, names, and attachments in fixtures.

For platform-specific changes, state which operating systems you tested. A pull request can still be reviewed when another platform is unavailable, but it must not claim unperformed validation.

## Pull requests

Describe the problem, the chosen behavior, security or data-loss implications, and validation performed. Include screenshots for visual changes when practical, using a synthetic vault with no personal information. Update user or contributor documentation when behavior, support, privacy, or build steps change.

Pull requests must keep lockfiles consistent and must not include generated build output, local settings, real vaults, credentials, proprietary assets, or copied code without compatible licensing and attribution.

## Licensing and provenance

Contributions are licensed under the project’s [MIT License](LICENSE). NoteM uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/); sign off every commit with:

```sh
git commit -s
```

The sign-off certifies that you have the right to submit the contribution under the project license. NoteM does not currently require a separate contributor license agreement.

Identify third-party code, fonts, icons, fixtures, or generated assets in the pull request and preserve all required notices. If an AI tool assisted with a contribution, you remain responsible for reviewing the output, confirming that it contains no secrets or inappropriate copied material, and establishing that the project may distribute it.
