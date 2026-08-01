# Public-release readiness audit

**Repository:** `omermj/notem`

**Audited revision:** `e8c6a80c85bf25a0700a3e9e7ef216f212420e94` (`v0.2.0`)

**Audit date:** 2026-08-01

**Scope:** tracked tree, all reachable refs and commits, dependencies/assets, workflows, Tauri trust boundaries, documentation, and the existing GitHub release

**Change discipline:** this report is the only tracked file created or modified by the audit.

## Phase 0 remediation record

Phase 0 was completed on 2026-08-01 without changing repository visibility or rewriting history:

- The repository remains private.
- The published `v0.2.0` release was converted to a draft. Its tag and three artifacts were retained.
- All refs were backed up in a restorable Git bundle, and all three `v0.2.0` artifacts were downloaded and SHA-256 checksummed outside the repository.
- The project license decision is MIT, with `Copyright (c) 2026 NoteM contributors` as the copyright line.
- Public commit and tag metadata will use `87920462+omermj@users.noreply.github.com` rather than the personal address found by the audit.
- The public repository will start from a clean/squashed baseline so the proprietary-font blob and personal commit metadata are not published.
- The first remediated release will be `v0.2.1`; the existing `v0.2.0` artifacts will not be republished.

The backup contains the material being removed from publication and must remain private. Its local location is intentionally not committed to the repository. History replacement, tag recreation, and public visibility remain later, separately verified steps.

## Phase 1 remediation record

Phase 1 was completed in the working tree on 2026-08-01:

- A root MIT `LICENSE` was added with `Copyright (c) 2026 NoteM contributors`.
- npm and Cargo package metadata now declare MIT and link to the project repository; the README license section links to the project license and notices.
- `THIRD_PARTY_NOTICES.md` now retains the complete license texts for the bundled PDF.js resources, dictionary data, fonts, WASM components, and adapted Feather glyphs.
- Implementation review additionally identified QuickJS WASM and four MPL-2.0 PDF.js viewer SVGs. Their MIT/MPL notices and corresponding-source location are included.
- The production build copies the project license and notices into `dist/legal/`, Tauri installs standalone copies under its `legal/` resource directory, and the About panel exposes both documents from the application bundle. A native macOS application build confirmed byte-identical resource copies.
- `docs/ASSET_PROVENANCE.md` records the NoteM mark, generated platform icons, interface glyphs, dependency assets, and generated fixtures.
- On 2026-08-01, the maintainer confirmed ownership of the Codex-created NoteM SVG and permission to distribute it under MIT.
- The Unicode PDF generator now uses pinned ReportLab/pypdf versions and only the locked `LiberationSans-Regular.ttf`; it rejects a missing dependency instead of searching system fonts or falling back.
- The regenerated Unicode fixture embeds Liberation Sans, contains no Arial reference, extracts the intended multilingual text, and reproduced the same SHA-256 hash across repeated runs.

The old Arial-containing fixture remains reachable in the private pre-remediation Git history and private backup. It must still be excluded when the clean public baseline is created. Phase 1 does not authorize or perform that later history replacement.

## Phase 2 remediation record

Phase 2 was completed in the working tree on 2026-08-01:

- Vault path validation is centralized in `src-tauri/src/vault_path.rs`. Existing paths reject every symlink component; new paths validate/create parents individually, reject broken-link destinations, canonicalize containment, and reserve final files with create-new semantics.
- The boundary now covers note creation, folder creation, rename/move destinations, attachment and tree imports, `.notem`, vault settings, SQLite database/sidecar paths, backlinks/link rewrites, and watcher-driven index sync.
- A selected vault root that is later replaced by a symlink is treated as unavailable by commands and the watcher.
- Cross-platform-compiling regression tests cover existing and new paths through symlinked directories, symlinked `.notem`, final settings/index symlinks, and replacement of the vault root. Windows tests skip only when the host denies symlink creation.
- Reading view cancels the default action for every rendered anchor before dispatch. HTTP, HTTPS, and mailto open externally; vault-relative PDFs open internally; FTP, file, JavaScript, custom schemes, protocol-relative URLs, fragments, and relative non-PDF links remain inert. Pure TypeScript tests cover the classification.
- Production CSP no longer contains Vite HTTP/WebSocket origins; those origins exist only in `devCsp`. JavaScript prototype freezing is enabled.
- Tauri capabilities are split: the main window retains dialog, window-state, and clipboard-write permissions, while `note-*` windows receive core permissions only and start with sidebars collapsed.
- `docs/THREAT_MODEL.md` documents the untrusted-vault model, intentional recursive read-only asset scope, required inline-style CSP exception, host-path IPC exposure, and residual path TOCTOU risk.

Validation passed on macOS ARM: 39 active Rust tests plus one ignored performance test, Clippy with `-D warnings`, 57 frontend tests, Svelte diagnostics, ESLint, production frontend build, native Tauri application build, capability manifest generation, CSP configuration assertions, and strict code-signature verification. Native Linux/Windows validation remains required before publication.

## Phase 3 remediation record

Phase 3 was completed in the working tree on 2026-08-01:

- The context-menu shadow now uses `var(--shadow-medium)`, and `pnpm audit:theme` passes.
- Tauri's run callback uses underscore-prefixed bindings that remain available to the macOS-only open-file block without producing unused-variable warnings on other targets.
- Release-mode Windows builds now select the Windows GUI subsystem, preventing the application from opening a console window. Native Windows packaging and launch validation remain required.
- pnpm's workspace-level override moves the development-only ESLint dependency chain from vulnerable `brace-expansion@1.1.16` to patched `1.1.18`. Both `pnpm audit` and `pnpm audit --prod` report no known vulnerabilities.
- The unused frontend `tags_files` throwing stub was removed; no registered Rust command or caller depended on it.

Validation passed on macOS ARM: formatting, theme audit, Svelte diagnostics, ESLint, 57 frontend tests, production frontend build, 39 active Rust tests plus one ignored performance test, Clippy across all targets/features with `-D warnings`, and a native release-mode Tauri application bundle. Native Linux/Windows validation remains required before publication.

## Phase 4 remediation record

Phase 4 was completed in the working tree on 2026-08-01:

- Every `uses:` reference is pinned to a full reviewed commit SHA with its upstream tag noted in a comment. The deprecated `pnpm/action-setup` path and write-enabled `tauri-action` release path were removed; weekly GitHub Actions Dependabot updates are enabled for reviewed pin refreshes.
- CI and release builds use fixed Ubuntu/macOS/Windows runner labels, Node.js 22.18.0, pnpm 11.17.0 through Corepack, and Rust 1.97.1. Checkout never persists credentials.
- The release workflow first validates an exact semantic-version input through the GitHub API, requires an annotated tag pointing directly to a commit, and exposes the resolved commit and tag-object SHAs as job outputs.
- Platform jobs have only `contents: read`, check out the resolved commit SHA, build without a repository-write token, and upload seven-day Actions artifacts.
- A separate `release` environment job alone receives `contents: write`. It rechecks that the tag did not move, refuses to alter a published release, creates or updates only a draft, and uploads all installers plus `SHA256SUMS`.
- The release guide now requires a protected `v*` tag ruleset and approval protection on the `release` environment. The GitHub API confirms that neither is configured; GitHub Free currently rejects ruleset access while the repository is private. Configure them after visibility changes (or after a plan upgrade) and before adding collaborators or dispatching the first hosted public release.

Local validation passed for Prettier formatting, generic YAML parsing, the full-SHA Action inventory, the annotated-tag API response shape, and all Phase 3 frontend/Rust checks. `actionlint` is not installed, so the workflows still require their first GitHub-hosted validation run; native Linux/Windows builds remain required before publication.

## Phase 5 remediation record

Phase 5 was completed in the working tree on 2026-08-01, except for the maintainer-supplied screenshots intentionally deferred to a later phase:

- The README now separates end-user installation from source packaging, identifies `v0.2.1` as the planned first public release, and provides exact Linux x86-64, macOS 11+ Apple Silicon, and Windows 10/11 x86-64 support boundaries.
- Checksum verification and the unsigned/unnotarized status are prominent near installation. Privacy behavior, local storage, network boundaries, alpha limitations, unsupported platforms, and backup responsibility are explicit.
- `PRIVACY.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `docs/ARCHITECTURE.md` document local data behavior, private vulnerability reporting, the latest-minor support policy, DCO sign-off, provenance requirements, testing, architecture, events, and trust boundaries.
- Structured bug and feature issue forms require version/platform context and warn contributors to redact vault data. The pull-request template covers tests, platform claims, visual evidence, licensing/provenance, privacy, and DCO sign-off.
- `AGENTS.md` no longer describes NoteM as another product's clone or lists the removed `tags_files` stub. Historical phase/development prompt documents are labeled as historical rather than current validation or roadmap claims.
- A Code of Conduct remains optional polish because no separate private conduct-reporting contact has been designated. Screenshot placeholders remain unchanged at the maintainer's request.

Documentation formatting, relative links, issue-form structure, and common local-path/credential markers were checked locally. The full frontend suite (57 tests), Svelte diagnostics, ESLint, theme audit, production build, both pnpm audits, 39 active Rust tests, Rust formatting, and all-target/all-feature Clippy with warnings denied also pass. GitHub private vulnerability reporting must be enabled when the repository becomes public so the documented private report URL becomes active.

## Phase 6 remediation record

Phase 6 was completed locally on 2026-08-01 without pushing or changing repository visibility:

- The verified Phase 0 Git bundle remains the private recovery source for every original ref and the withdrawn `v0.2.0` tag. The three withdrawn release artifacts remain outside the repository and were SHA-256 rechecked.
- Before the cutover, the complete 223-file Phase 1–5 working tree was archived outside the repository. The compressed archive passed integrity and file-count checks and has SHA-256 `ed5f962c2c2db57e7e1dd15274d9d898cd0645667824441e7936b3b2eb12ac70`.
- `docs/PHASES.md` was removed at the maintainer's request, and retained engineering/audit references were updated.
- The publication branch was rebuilt as one parentless root commit using `Omer <87920462+omermj@users.noreply.github.com>`. The local `main` branch was aligned to that root, and the old local `v0.2.0` and remote-tracking refs were removed so all branch, tag, and remote-tracking refs intended for publication describe only the candidate public history.
- The original proprietary-font blob and personal commit email are not reachable from the candidate public refs. The old objects remain recoverable only through the private external backup and may remain temporarily as unreachable local Git objects/reflogs until final cleanup.
- No force-push, remote tag deletion, visibility change, release creation, or GitHub-settings mutation was performed. The private remote still requires the controlled Phase 7 ref replacement before it can become public.

Codex may maintain private `refs/codex/turn-diffs/*` checkpoints for local change visualization. Those application-local refs are not publication refs, are not included by the planned explicit branch/tag push, and may be recreated while this task is active; they must never be mirror-pushed.

The candidate tree was checked for common credentials, private keys, local developer paths, the personal email identified by the audit, and Arial font markers. The regenerated Unicode fixture contains Liberation Sans and no Arial marker. A checksum-verified, ephemeral Gitleaks 8.30.1 scan examined the parentless candidate history and reported no leaks. Native-platform validation remains a publication gate.

## 1. Executive verdict

## NOT READY

Do not change the repository to public yet.

No live API key, token, private key, cloud credential, signing credential, webhook, connection string, `.env` file, or personal vault was found by the manual current-tree and reachable-history scans. However, the repository is not legally or operationally ready for public visibility:

1. There is no root `LICENSE`; the README expressly says no license has been selected and all rights are reserved.
2. `src-tauri/tests/fixtures/vault/attachments/pdf-fixtures/unicode.pdf` embeds a subset of proprietary Arial Unicode MS. It is present in the current tree and reachable history beginning at commit `23f3fc5`. The generator prefers this font on macOS.
3. Distributed PDF.js and dictionary resources do not have a complete project-level third-party notice mechanism. A `THIRD_PARTY_NOTICES.md`, shipped in installers, is needed.
4. At audit time, the existing `v0.2.0` GitHub Release was published, not a draft/prerelease. Its unsigned Linux, macOS, and Windows assets predate the license/notices and Windows console fix. Phase 0 subsequently converted it to a draft.
5. Vault-scoped filesystem operations have symlink-escape gaps that can write outside a vault containing attacker-controlled symlinks.
6. Current CI is red. `pnpm audit:theme` fails before Rust checks; non-macOS Clippy warnings are also evident from source.
7. `pnpm audit` reports one high-severity advisory in development tooling.
8. Every GitHub Action uses a mutable tag/branch. The release job checks out a caller-selected ref while holding `contents: write` and runs code from that ref.

Recommendation: complete the P0/P1 work below, clean or replace public history, rebuild/withdraw the release, run the unavailable scanners and native-platform checks, and complete the checklist before publication.

## 2. Audit method and limits

### Inspected

- All tracked paths reported by `git ls-files`, including sources, locks, workflows, docs, icons, sample vault notes, and PDFs.
- All 17 reachable commits and the annotated `v0.2.0` tag using the requested `git log --all --format=...` and `git log --all --name-status` checks.
- Current and historical content using credential, identity, local-path, hostname, IP-address, employer/internal-name, and signing/license pattern searches.
- Both files under `.github/workflows/`.
- Tauri config/capabilities, registered Rust commands, relevant index/watcher paths, frontend `invoke` use, Markdown rendering, URL opening, asset resolution, and PDF loading.
- JavaScript license inventory with `pnpm licenses list`, Rust license metadata with `cargo metadata`, JS advisories with `pnpm audit`, fixture metadata/strings, and PDF.js asset licenses.
- The private GitHub repository, CI state, and current release using read-only GitHub CLI calls.
- Local checks: Svelte diagnostics, ESLint, Vitest, Vite build, Rust tests, macOS-host Clippy, theme audit, final `git diff --check`, and status.

### Not fully verified

- At audit time, `gitleaks` was not installed. Phase 6 subsequently ran a checksum-verified ephemeral Gitleaks 8.30.1 binary against the parentless candidate history with no leaks found.
- `cargo-audit` and `cargo-deny` were not installed. Rust advisories and policy evaluation remain unverified.
- Windows/Linux builds and Clippy were not runnable on this Apple Silicon host. Static confirmation and existing Actions state were used.
- Signing/notarization, SmartScreen reputation, Linux package signing, and reproducibility cannot be verified because signing is not configured.
- Git cannot prove asset authorship. The logo appears project-specific and raster icons appear derived from it, but a contributor must attest to provenance. At least one inline glyph is recognizably Feather-derived and needs attribution or replacement.
- This audit did not reverse-engineer every transitive dependency or execute untrusted PDFs.

## 3. Critical blockers and required changes

The labels here are publication priority, not CVSS.

### P0 — remove proprietary font material from the tree and history

The Unicode fixture contains an embedded `AAAAAA+ArialUnicodeMS` descriptor and `/FontFile2`. The generator searches these macOS paths before a free font:

- `/Library/Fonts/Arial Unicode.ttf`
- `/System/Library/Fonts/Supplemental/Arial Unicode.ttf`

No redistribution license for this font is present.

Required remediation:

1. Use only an explicitly redistributable, deterministic font. A suitable file already in the dependency tree is `pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf` (OFL-1.1). Adjust sample characters to its coverage.
2. Regenerate `unicode.pdf` and verify its embedded font.
3. Include the font attribution/license in third-party notices.
4. Remove the old blob from every public ref. Replacing the working-tree file is insufficient. Either publish a clean/squashed repository, or remove this path from all refs with `git filter-repo`, re-add a clean fixture, recreate tags/releases, and force-push the rewritten refs.
5. Since the repository has never been public and has no forks, a clean public history is safest. If retaining the same GitHub repository, ask GitHub Support about cached-object purging if a hard guarantee is required.

### P0 — add an explicit MIT license

There is no root `LICENSE`; npm and Cargo metadata omit a license; README says all rights are reserved. Public source without a license is not open source.

Proposed copyright line:

```text
Copyright (c) 2026 NoteM contributors
```

Add standard MIT text to root `LICENSE`, `"license": "MIT"` to `package.json`, `license = "MIT"` to Cargo package metadata, and replace README's current License section. Keep `"private": true`; that prevents accidental npm publication and does not conflict with an open-source license.

### P0 — add and distribute third-party notices

The app copies PDF.js code and its CMaps, ICC profiles, web images, standard fonts, and WASM components, plus `dictionary-en` data. Some PDF.js subdirectories carry license files, but the build does not deliberately carry the root PDF.js Apache license or the dictionary's composite license.

Create and ship `THIRD_PARTY_NOTICES.md` containing at least:

- PDF.js / `pdfjs-dist` — Apache-2.0.
- Adobe CMaps — BSD-style terms in `cmaps/LICENSE`.
- ICC profiles — CC0-1.0.
- Liberation fonts — SIL OFL-1.1.
- Foxit/PDFium fonts — BSD-style terms.
- JBIG2, OpenJPEG, and qcms WASM components — their packaged BSD/MIT/Apache terms.
- `dictionary-en` / SCOWL-derived Hunspell data — the complete composite notices retained in the package's `license` file.
- Feather Icons — MIT attribution for derived glyphs, unless replaced or independently documented.
- Any other externally sourced asset identified during contributor provenance review.

Expose the notice from About or installed documentation and configure Vite/Tauri to place it in every installer. Preserve full notices where licenses require copyright/disclaimer retention.

### P0 — do not expose the current release unchanged

At audit time, the private repository had a published, non-prerelease `v0.2.0` release with:

- `NoteM_0.2.0_aarch64.dmg`
- `NoteM_0.2.0_amd64.AppImage`
- `NoteM_0.2.0_x64-setup.exe`

These assets are unsigned, predate project/third-party licensing, and the Windows build has the console defect. Before visibility changes, move the release back to draft/delete it, or rebuild and replace it from a cleaned commit. Add checksums and prominent signing disclosure. Recreate the release if the tag/history is rewritten.

### P1 — close vault symlink escapes

See `TAURI-HIGH-1` in section 9. A malicious shared/downloaded vault can redirect several writes outside the vault.

### P1 — restore green CI and resolve the advisory

- Replace context-menu shadow literals with a theme variable.
- Fix non-macOS unused closure parameters.
- Add the Windows GUI subsystem attribute.
- Update the dependency graph so `brace-expansion@1.1.16` becomes `>=1.1.17`, then refresh the lockfile.
- Run Linux and Windows-native CI/checks.

### P1 — harden and pin workflows

Pin all Actions listed in section 8, restrict release-token use, validate an immutable version tag before executing repository code, and disable persisted checkout credentials.

### P1 — run unavailable security tools

Run Gitleaks, cargo-audit, and cargo-deny using section 13. A confirmed credential requires revocation plus history cleanup; deletion alone is not sufficient.

## 4. Recommended improvements after publication

After P0/P1 closure:

- Enable Dependabot alerts, secret scanning/push protection, code scanning, and dependency update automation for pnpm, Cargo, and Actions.
- Protect `main`: require PRs, green checks, reviews, and no force pushes after one-time cleanup.
- Add artifact attestations, SBOMs, checksums, and a reproducibility policy.
- Split read-only builds from protected/manual publication.
- Pin the Rust toolchain and release runner images more tightly.
- Add issue forms, a PR template, Code of Conduct, and contributor governance.
- Add automated tests for symlinked vault paths, unsupported links, CSP behavior, and bundled notices.
- Confirm “NoteM” name/trademark availability and document a project-mark policy if desired.
- Reframe LLM-oriented development notes as historical material or replace them with public architecture/roadmap docs.

## 5. Secrets, identity, and Git-history findings

### Current tracked tree

**No confirmed credential found.** The scan found no API/access token, private key, certificate, service password, webhook, connection string, cloud/signing credential, `.env`, credential-like filename, private IP/hostname, developer absolute path, employer/customer material, personal document, or real personal vault.

The password string used by `password-notem.pdf` and its test is an intentionally documented synthetic fixture password, not a credential. Localhost URLs are dev/CSP endpoints. Lock integrity strings and compressed PDF bytes caused false positives.

Identity/provenance items:

- `omermj` intentionally appears in repository URLs in `docs/RELEASING.md`.
- `src/lib/editor/spellcheckWords.test.ts` includes “Omer” in synthetic text. Replace it if minimizing personal identifiers.
- Example email addresses use `example.com`.
- “OpenAI” occurs only in an external-link test, not as employer attribution.
- The fixture vault is synthetic.
- SVG/raster icons show no obvious embedded author metadata; contributor provenance attestation remains necessary.

### Reachable Git history

- All 17 commits use the same personal Gmail address as author and committer. The annotated tag exposes it too. This report deliberately redacts the local part.
- Decide explicitly whether that public exposure is acceptable. If not, rewrite author/committer/tag metadata to the account's GitHub `noreply` address and recreate the tag before publication.
- Commit subjects/historical filenames contain no employer/customer names or suspicious removed credential files.
- The proprietary-font PDF is reachable beginning at `23f3fc5`, so history cleanup is mandatory.
- Local `git fsck --no-reflogs --unreachable` showed loose unreachable trees/blobs but no unreachable commits. A normal push/visibility change exposes reachable refs, not this clone's loose unreachable objects. Never distribute the local `.git` directory.

### Scanner limitation

At audit time, Gitleaks, TruffleHog, and detect-secrets were absent. Manual checks covered common prefixes, private-key headers, secret assignments, URLs, paths, identities, suspicious filenames, and all reachable revisions. Phase 6 later satisfied the Gitleaks requirement for the candidate public history; the other two scanners remain optional defense in depth.

## 6. Project licensing findings

| Surface                | Current state                                       | Required MIT change                                                    |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Root `LICENSE`         | Missing                                             | Add standard MIT text and proposed copyright line.                     |
| `README.md`            | Says no license/all rights reserved                 | Replace with MIT statement and links to license/notices.               |
| `package.json`         | No license                                          | Add `"license": "MIT"`; repository/bugs/homepage metadata recommended. |
| `src-tauri/Cargo.toml` | No license; metadata reports `NO-LICENSE` for NoteM | Add `license = "MIT"`, repository/homepage/readme metadata.            |
| Source headers         | None                                                | SPDX headers optional, not required.                                   |

MIT licensing NoteM does not relicense third-party assets; preserve their terms separately.

## 7. Dependencies and third-party licensing

### JavaScript inventory

`pnpm licenses list --prod --json` reported no unknown production license:

| Declared license  |       Package count |
| ----------------- | ------------------: |
| MIT               |                  50 |
| ISC               |                   4 |
| Apache-2.0        |                   3 |
| MIT OR Apache-2.0 |                   2 |
| Apache-2.0 OR MIT |                   1 |
| Python-2.0        |                   1 |
| BSD-2-Clause      |                   1 |
| MIT AND BSD       | 1 (`dictionary-en`) |

The dev graph additionally includes permissive BSD-3-Clause, BlueOak, and variants. No GPL/AGPL JS package was reported.

At audit time, `pnpm audit` found one **high** advisory: `brace-expansion@1.1.16` via ESLint's `minimatch@3.1.5`, `GHSA-mh99-v99m-4gvg` (unbounded expansion/memory DoS). Phase 3 overrides that exact vulnerable resolution to `1.1.18`; both the full and production audits now report no known vulnerabilities.

### Rust inventory

`cargo metadata --locked` found declared license metadata for all registry packages; only NoteM was `NO-LICENSE`. Most are MIT/Apache/BSD/ISC/Unicode/Zlib/CC0 combinations. MPL-2.0 appears in `cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, and `selectors`. These are not an immediate MIT incompatibility, but `cargo-deny` must validate policy and distribution notices/source availability should cover MPL components.

`cargo-audit` was unavailable, so no RustSec verdict exists.

### PDF.js resources

Vite copies entire `pdfjs-dist@6.1.200` directories:

- 169 CMap files (including license);
- 16 standard-font files (including Foxit/Liberation licenses);
- 2 ICC files (including CC0 terms);
- 13 WASM files (including component licenses);
- web images, JavaScript, worker, and CSS.

Subdirectory licenses do not replace the root Apache license and consolidated notices in every application bundle.

### Dictionary

Only `index.aff` and `index.dic` are copied to `dist/spellcheck`; the package's composite `license` is not. Ship the complete retained SCOWL/incorporated-source notices.

### Icons, logo, CSS, fixtures

- The NoteM logo looks project-specific, and platform icons appear derived from it, but ownership is not proved by repository metadata. Obtain contributor attestation.
- The gear path in `RibbonIcon.svelte` closely follows Feather Icons' MIT settings glyph. Attribute Feather or replace/document original work; review remaining inline icons similarly.
- No obvious copied stylesheet header or proprietary sample note was found. Contributor attestation is still the remaining provenance control.
- Other ReportLab PDFs use non-embedded Helvetica. The Unicode fixture embeds Arial Unicode MS and is a blocker.
- Fixture generation depends on unpinned `reportlab` and `pypdf`; pin/document a reproducible generator environment later.

### Is `THIRD_PARTY_NOTICES.md` needed?

**Yes.** NoteM distributes dictionary data, fonts, CMaps, WASM codecs/color code, PDF.js code/assets, and likely Feather-derived glyphs. Notices must be inside installers, not only the repository.

## 8. GitHub Actions findings

### Positive controls

- No `pull_request_target`.
- PR CI has `contents: read`, no secrets, and ordinary `pull_request`.
- No PR title/branch/issue text is interpolated into shell.
- Release input reaches the verifier through an environment variable, not direct shell interpolation.
- Release workflow is manual and requests a draft; it does not publish automatically.
- Fork PRs can run build/test code as expected but receive no write token or repository secrets.

### ACTIONS-HIGH-1 — selected ref runs with write permission

The release workflow grants `contents: write` at workflow scope, checks out the `inputs.tag` value, installs dependencies, runs a repository script, and builds repository code before upload. The input may name any resolvable ref, not only an immutable `v*` tag. Checkout persists credentials by default.

`workflow_dispatch` normally requires write access, so arbitrary forks cannot trigger this directly. It still violates least privilege and magnifies a compromised collaborator, moved tag, or input error.

Required fix:

1. Validate format and prove the input resolves to an existing immutable `refs/tags/v*` tag before executing code.
2. Set `persist-credentials: false`.
3. Give build jobs `contents: read`; upload Actions artifacts without repository-write credentials.
4. Publish in a separate protected/manual job with narrowly scoped `contents: write`.
5. Do not expose `GITHUB_TOKEN` to install/build/test steps.

**Phase 4 status:** remediated in workflow YAML. Build jobs use the validated commit SHA with read-only permissions and non-persisted checkout credentials. Only the final `release` environment job can write. Environment approval and the `v*` tag ruleset remain manual GitHub settings; the current GitHub plan does not expose private-repository rulesets.

### ACTIONS-HIGH-2 — mutable Action refs

Pin every `uses:` to a full SHA. The following were behind the configured refs on 2026-08-01; re-verify upstream before editing:

| Current reference               | Workflows   | Commit observed                            |
| ------------------------------- | ----------- | ------------------------------------------ |
| `actions/checkout@v7`           | CI, release | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `pnpm/action-setup@v4`          | CI, release | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |
| `actions/setup-node@v6`         | CI, release | `249970729cb0ef3589644e2896645e5dc5ba9c38` |
| `dtolnay/rust-toolchain@stable` | CI, release | `4cda84d5c5c54efe2404f9d843567869ab1699d4` |
| `swatinem/rust-cache@v2`        | CI, release | `e18b497796c12c097a38f9edb9d0641fb99eee32` |
| `tauri-apps/tauri-action@v1`    | release     | `1deb371b0cd8bd54025b384f1cd735e725c4060f` |

Keep a tag comment and automate reviewed updates. Pin the Rust toolchain version separately from the Action commit.

**Phase 4 status:** remediated. All retained Actions and the newly introduced artifact Actions use full SHAs; Node, pnpm, Rust, and runner labels are also fixed. `pnpm/action-setup` and `tauri-action` are no longer used.

### Other observations

- Latest CI run `30413874671` failed in Frontend checks because theme audit exits 1; Rust stages were skipped.
- At audit time, GitHub warned that `pnpm/action-setup@v4` used the deprecated Node 20 action runtime. Phase 4 replaced it with controlled Corepack setup.
- Phase 4 fixed runner labels and Node/Rust versions rather than relying on moving majors or `stable`.
- Phase 4 moved release mutation out of the matrix into one aggregate environment-gated job.
- Phase 4 adds SHA-256 checksums. SBOMs, attestations, and cryptographic release signatures are still not produced.
- The published `v0.2.0` appears to have been created outside this draft-only workflow; no corresponding run was in the queried list.

## 9. Tauri desktop security findings

Severity assumes a trusted renderer but potentially untrusted vault content.

### TAURI-HIGH-1 — incomplete symlink containment

**Areas:** `commands/files.rs`, `commands/links.rs`, `commands/settings.rs`, and `.notem` index setup.

Most existing-file operations canonicalize and check containment. Several creation/write paths do not:

- `file_create_with_content` checks a new destination lexically, then uses `create_dir_all`/`write`; a symlinked parent can redirect outside.
- `import_attachment` uses an `attachments` directory without rejecting an existing symlink.
- `vault_open` and settings/index code use `<vault>/.notem` without rejecting a symlink; `settings.json`/`index.db` can be created elsewhere.
- `links_link_unlinked` validates lexical relativity then uses `root.join`, not `resolve_existing`; a symlinked Markdown path can redirect reads/writes.
- Watcher/index sync should be checked for the same issue because metadata/read calls may follow symlinks even though the main walker does not.

Impact: a prepared shared/downloaded vault can cause file creation/modification outside the selected vault. Fixed names/extensions constrain some paths but do not remove the boundary violation.

Smallest correct design:

1. Centralize vault path resolution.
2. Canonicalize root once.
3. Canonicalize/check existing targets.
4. For new targets, canonicalize the nearest existing parent, reject symlink components (including `.notem` and `attachments`), check containment, then create with no-follow semantics where available.
5. Prefer capability-oriented directory APIs such as `cap-std` for race resistance, or document residual TOCTOU risk.
6. Add cross-platform symlink tests.

### TAURI-MEDIUM-1 — unsupported anchors retain default navigation

`ReadingView.svelte` prevents default only for allowlisted external URLs or recognized PDFs. Markdown-it rejects tested `javascript:` and `file:` links, but renders schemes such as `ftp:` and ordinary relative anchors. These fall through to webview default navigation.

Fix: call `preventDefault()` for every rendered `<a href>` first, then dispatch only explicit allowed external/internal/PDF destinations. Make all others inert. Test `ftp:`, custom schemes, fragments, and non-PDF relatives.

### TAURI-MEDIUM-2 — broad host-path IPC after renderer compromise

`vault_open`, `attachment_import`, and `path_import` accept arbitrary absolute host paths over custom IPC. This is intended behind native dialogs/drop events, but a compromised renderer could call them directly, open an arbitrary directory as a vault, and read/copy host files.

Current XSS posture lowers likelihood. Defense in depth: authorize selections in Rust, use short-lived approved-path handles, and reduce the command/plugin surface of detached `note-*` windows.

### TAURI-LOW-1 — CSP production cleanup

Positive: `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, no `unsafe-eval`, restricted images/fonts/workers.

Concerns:

- `connect-src` always permits dev loopback HTTP/WebSocket endpoints in production.
- `style-src 'unsafe-inline'` weakens style-injection protection, though current editor/component styling may require it.
- Runtime asset scope recursively allows the selected vault.

Use separate dev/production CSP, remove loopback dev origins in production, and narrow/document the asset scope.

### TAURI-LOW-2 — split capabilities by window role

The default capability gives main and `note-*` windows core defaults, dialog open, window state, and clipboard write. Detached viewers likely need less. Split plugin permissions.

### Positive controls

- All frontend `invoke` calls are wrapped by `src/lib/api.ts`.
- Relative validation rejects absolute paths, backslashes, `..`, roots/prefixes, and `.`.
- Existing paths are normally canonicalized and checked against root.
- External URL opening is independently allowlisted in TS and Rust to HTTP, HTTPS, and mailto.
- OS reveal/open uses argument arrays, not shell strings; no arbitrary shell execution found.
- Imported directory trees reject symlinks and skip dot-directories.
- Markdown-it has raw HTML disabled; custom content/attributes are escaped.
- Reading view `{@html}` is bounded by that renderer; raw scripts are escaped.
- PDF.js resources are local. No telemetry, cloud API, remote script, iframe, or intentional external webview content was found.
- CSP currently blocks HTTP(S) images although `resolveVaultAsset` can return them; resolve this behavioral mismatch deliberately.

No critical remote-code-execution finding was identified.

### TAURI-INFORMATIONAL-1 — renderer and network posture

The application is local-first in the inspected implementation: it does not configure telemetry, an account service, remote scripts, iframes, or an updater endpoint. Markdown raw HTML is disabled, and the CSP blocks the HTTP(S) image URLs that the asset helper can otherwise produce. The main residual network action is an explicit user click that opens an allowlisted URL in the operating-system handler. Preserve these properties in the public threat model and regression tests.

## 10. Known defects and smallest fixes

### 10.1 Theme audit — remediated in Phase 3

At audit time, `pnpm audit:theme` exited 1 for two hard-coded black context-menu shadows. Phase 3 replaced them with the existing `--shadow-medium` theme token, and the audit now passes.

Smallest fix:

```css
.context-menu {
  /* existing properties */
  box-shadow: var(--shadow-medium);
}
```

If exact per-theme appearance matters, add `--shadow-context-menu` in both theme files. Reusing `--shadow-medium` is the smallest change.

### 10.2 Windows/Linux Clippy parameters — remediated in Phase 3

`main.rs` uses `app` and `event` only inside a macOS conditional block. Non-macOS removes the block, so `-D warnings` rejects unused parameters.

Smallest fix:

```rust
.run(|_app, _event| {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Opened { urls } = _event {
        // use _app as before
    }
});
```

Phase 3 applied the underscore-prefixed bindings. They remain usable on macOS, and macOS-host Clippy passes with all targets/features and `-D warnings`; re-run native Linux/Windows before publication.

### 10.3 Windows release console — source-remediated in Phase 3

Phase 3 added the GUI subsystem attribute as the first crate-level line:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

This suppresses the console only in non-debug builds. Confirm the packaged executable on native Windows before marking the platform acceptance check complete.

## 11. Documentation and presentation

### Present and useful

- Substantive README with features, vault format, safety behavior, shortcuts, dev prerequisites, per-platform build commands, CI, and signing caveats.
- Release guide with local/hosted flows and unsigned/unnotarized disclosure.
- Architecture/implementation intent in `AGENTS.md` and phase notes.
- OS names and macOS ARM information.
- Privacy-adjacent claims: no account, cloud dependency, proprietary format, or telemetry.

### Required before visibility

- MIT `LICENSE` and consistent metadata.
- Bundled `THIRD_PARTY_NOTICES.md`.
- `SECURITY.md` with supported versions and a private report path, preferably GitHub private vulnerability reporting.
- Real, redacted screenshots from a synthetic vault.
- End-user download/install instructions; current instructions primarily explain developer builds.
- Exact support matrix: Linux distro/base ABI and x64 formats, macOS 11+ Apple Silicon only, Windows x64, and unsupported architectures.
- Prominent release verification/signing section near installation.
- Explicit privacy section covering local files, disposable FTS cache, settings locations, no telemetry/update checks, external links, and what may leave the machine.
- Known limitations/alpha status, including unsigned releases and support policy.
- Reconcile docs with reality: red CI, only local macOS validation, no Debian release asset, and Windows console defect.

**Phase 5 status:** all documentation items above are remediated except real screenshots, which the maintainer explicitly deferred. The README accurately states that native Linux/Windows validation is pending and no public binary release is currently supported.

### Strongly recommended before accepting contributions

- `CONTRIBUTING.md`: setup, tests, commits, platform expectations, DCO/CLA choice, and provenance rules.
- PR template with tests/screenshots/license/platform checkboxes.
- Bug/feature issue forms with OS/version and log-redaction guidance.
- Public architecture overview distilled from `AGENTS.md`.

**Phase 5 status:** completed with contribution guidance, DCO/provenance rules, structured issue forms, a pull-request template, and a public architecture overview.

### Optional polish

- Code of Conduct and enforcement contacts.
- Roadmap/milestones, governance, maintainers, contributor recognition, changelog.
- Reframe LLM-specific development prompt docs; they are not sensitive, but look internal rather than contributor-facing.

### Repository hygiene findings

- The tracked tree was clean at audit start. `node_modules/`, `dist/`, `.svelte-kit/`, Rust `target/`, generated Tauri schemas, `.DS_Store`, and logs are ignored; none of those generated/local paths is tracked.
- Both lockfiles are tracked, and `packageManager` pins pnpm 11.17.0. This is good for repeatable installs, subject to the advisory update.
- No tracked file is unusually large enough to require Git LFS; the largest tracked item is the macOS icon container, and PDF fixtures are small.
- `.DS_Store` files exist locally but are ignored and will not be published through Git.
- At audit time, `AGENTS.md`, `docs/DEV_NOTES.md`, and `docs/PHASES.md` contained internal build prompts and cross-platform acceptance language. Phase 5 reframed the retained engineering guidance, and Phase 6 removed `docs/PHASES.md` before the clean baseline.
- At audit time, `src/lib/api.ts` exported `tags_files` as an unimplemented throwing stub with no matching Rust command or caller. Phase 3 removed it.
- The repository has no vendored `node_modules` or Rust crate sources. The production build does intentionally copy dependency assets, which is why bundled notices are required.

## 12. Exact proposed file changes

No implementation change was made by this audit.

| File                                      | Proposed change                                                                        | Priority |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| `LICENSE`                                 | Standard MIT text and proposed copyright.                                              | P0       |
| `README.md`                               | MIT/notices, screenshots, installation, support matrix, privacy, signing, limitations. | P0/P1    |
| `package.json`                            | License/repository/bugs/homepage; dependency update. Keep `private`.                   | P0/P1    |
| `pnpm-lock.yaml`                          | Refresh to patched dev dependency graph.                                               | P1       |
| `src-tauri/Cargo.toml`                    | MIT and repository/homepage/readme metadata.                                           | P0       |
| `THIRD_PARTY_NOTICES.md`                  | Complete PDF.js/dictionary/font/WASM/icon notices.                                     | P0       |
| `vite.config.ts` and/or `tauri.conf.json` | Bundle project license and notices in installers.                                      | P0       |
| `scripts/generate-pdf-fixtures.py`        | Remove Arial paths; deterministic libre font; supported samples.                       | P0       |
| `.../unicode.pdf`                         | Regenerate and verify libre embedded font.                                             | P0       |
| Git refs/history                          | Remove old PDF blob; optionally rewrite personal email; recreate tag/release.          | P0       |
| `src-tauri/src/main.rs`                   | Windows subsystem attribute; underscore macOS-only parameters.                         | P1       |
| `src/styles/base.css`                     | Theme-variable context-menu shadow.                                                    | P1       |
| `commands/files.rs`                       | Symlink-safe path creation/import/attachments.                                         | P1       |
| `commands/links.rs`                       | Canonical resolver in `links_link_unlinked`.                                           | P1       |
| `commands/settings.rs` and index setup    | Reject symlinked `.notem`; safe contained paths.                                       | P1       |
| `index/watcher.rs`, `index/db.rs`         | Audit/test symlink following.                                                          | P1       |
| `ReadingView.svelte`                      | Prevent all default anchor navigation; explicit allowlist dispatch.                    | P1       |
| `capabilities/default.json`               | Split main/detached permissions.                                                       | P2       |
| `tauri.conf.json`                         | Production CSP cleanup/document asset scope.                                           | P2       |
| CI workflow                               | Pin Actions; supported pnpm runtime; reproducibility improvements.                     | P1       |
| Release workflow                          | Pin; immutable tag; no persisted credentials; split build/publish.                     | P1       |
| `SECURITY.md`                             | Supported versions/private reporting/disclosure policy.                                | P1       |
| `CONTRIBUTING.md`                         | Contribution/test/provenance/DCO guidance.                                             | P2       |
| GitHub templates                          | Issue/PR templates.                                                                    | P2       |
| `CODE_OF_CONDUCT.md`                      | Add if inviting community participation.                                               | P3       |
| Tests                                     | Symlink, navigation, cross-platform, and bundle-notice coverage.                       | P1/P2    |

Release actions:

1. Smoke-test clean Linux, macOS ARM, and Windows x64 builds.
2. Verify licenses/notices inside every artifact.
3. Rebuild all assets from the same cleaned tag, or publish a corrected version/prerelease rather than mixing artifacts.
4. Publish SHA-256 checksums and repeat signing caveats in release notes.

## 13. Commands the maintainer must run manually

Run after remediation from a clean clone of final public refs. Secret scanner output may be sensitive; keep full redaction and never paste raw findings into public issues.

### Gitleaks installation and scan

Gitleaks was missing. Official project: <https://github.com/gitleaks/gitleaks>.

**Windows:**

```powershell
winget install --id Gitleaks.Gitleaks --exact
gitleaks version
gitleaks git -v --redact=100 .
```

**macOS:**

```sh
brew install gitleaks
gitleaks version
gitleaks git -v --redact=100 .
```

**Linux x86-64 (v8.30.1 and its published checksum):**

```sh
curl -fsSLO "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz"
echo "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb  gitleaks_8.30.1_linux_x64.tar.gz" | sha256sum -c -
tar -xzf gitleaks_8.30.1_linux_x64.tar.gz gitleaks
sudo install -m 0755 gitleaks /usr/local/bin/gitleaks
gitleaks version
gitleaks git -v --redact=100 .
```

Linux ARM64 archive: `gitleaks_8.30.1_linux_arm64.tar.gz`, checksum `e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080`.

### Rust advisory/license tools

Not installed during audit:

```sh
cargo install cargo-audit --locked
(cd src-tauri && cargo audit)

cargo install cargo-deny --locked
(cd src-tauri && cargo deny check)
```

Add a reviewed `deny.toml`; explicitly account for MPL-2.0, Unicode-3.0, OFL-1.1, dictionary terms, and platform dependencies.

### Dependency and quality checks

```sh
pnpm install --frozen-lockfile
pnpm audit
pnpm audit --prod
pnpm licenses list --prod
pnpm check
pnpm lint
pnpm test
pnpm audit:theme
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### Native checks

**Windows x64:**

```powershell
pnpm install --frozen-lockfile
pnpm audit:theme
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm tauri build --bundles nsis
```

Confirm no console and inspect installed licenses/notices.

**Linux x86-64:**

```sh
pnpm install --frozen-lockfile
pnpm audit:theme
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm tauri build --bundles appimage,deb
```

**macOS Apple Silicon:**

```sh
pnpm install --frozen-lockfile
rustup target add aarch64-apple-darwin
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm tauri build --target aarch64-apple-darwin --bundles dmg
```

### Verify the regenerated fixture

With Poppler installed:

```sh
pdfinfo src-tauri/tests/fixtures/vault/attachments/pdf-fixtures/unicode.pdf
pdffonts src-tauri/tests/fixtures/vault/attachments/pdf-fixtures/unicode.pdf
strings src-tauri/tests/fixtures/vault/attachments/pdf-fixtures/unicode.pdf | rg 'ArialUnicodeMS|FontName|BaseFont|FontFile'
```

Expected: no Arial; only the selected libre font, whose license is in notices.

### Verify history and release

```sh
git log --all --format="%h %an <%ae> %s"
git log --all --name-status
git rev-list --objects --all | rg 'unicode\.pdf|\.env|\.(pem|key|p12|pfx)$'
gitleaks git -v --redact=100 .
git fsck --full --no-reflogs
gh release view v0.2.0 --repo omermj/notem --json tagName,isDraft,isPrerelease,assets
```

Use `git filter-repo` only in a disposable mirror/backup. Remove the old Unicode PDF path from all refs, re-add the clean file afterward, and recreate tags. Do not force-push the only private copy.

### Final repository checks

```sh
git diff --check
git status --short
```

Expected on the final release commit: no output.

## 14. Final go/no-go checklist

### Legal and provenance

- [x] Root MIT license exists with the proposed copyright.
- [x] README, npm, and Cargo metadata consistently say MIT.
- [x] Complete third-party notices are configured to ship in all installers.
- [x] Logo/icon/CSS/code provenance is attested; Feather-derived glyphs attributed/replaced.
- [x] Arial Unicode MS is absent from current tree and every candidate public ref.
- [x] Gitleaks passes the parentless candidate public history.
- [x] Personal commit/tag email exposure is rewritten in candidate public refs.

### Security

- [x] Vault create/import/settings/link/index paths reject prepared symlink escapes and have tests.
- [x] Reading-view anchors cannot navigate via unsupported destinations.
- [x] Production CSP has no unnecessary dev loopback.
- [x] Custom IPC/secondary-window capabilities are reviewed under a documented threat model.
- [ ] cargo-audit, cargo-deny, pnpm audit, and production audit have acceptable results.

### CI and releases

- [x] Every Action is pinned to a reviewed SHA.
- [ ] Builds are read-only; publication is narrow and protected (workflow complete; `release` environment protection pending).
- [ ] Release input is an immutable `v*` tag before code executes (workflow validation complete; tag ruleset pending).
- [x] Checkout does not persist credentials into selected/untrusted builds.
- [ ] Native Linux, macOS ARM, and Windows tests/Clippy/builds pass.
- [x] Theme audit passes.
- [ ] Windows release has no console (source fix complete; native Windows launch pending).
- [x] Current `v0.2.0` is withdrawn or rebuilt from cleaned tag.
- [ ] Release notes disclose signing status and publish checksums.
- [ ] License/notices are verified inside each artifact.

### Public presentation

- [ ] Real screenshots use synthetic data.
- [x] End-user installation and support matrix are clear.
- [x] Privacy and known-limitations sections exist.
- [ ] `SECURITY.md` gives a private report route (documented; GitHub feature enablement pending visibility).
- [x] Contribution guidance is ready before inviting contributors.
- [ ] GitHub security features/branch protections are enabled after cleanup.
- [ ] Final `git diff --check` and `git status --short` are clean.

## 15. Original audit and current validation results

The audit-time failures below are retained for traceability; the remediation column reflects the current working tree.

| Check                                              | Audit-time result                                    | Current remediation status                                       |
| -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm check`                                       | Pass — 0 errors/warnings                             | Pass — 0 errors/warnings                                         |
| `pnpm lint`                                        | Pass                                                 | Pass                                                             |
| `pnpm test`                                        | Pass — 13 files, 47 tests                            | Pass — 14 files, 57 tests                                        |
| `pnpm build`                                       | Pass; large-chunk warnings                           | Pass; large-chunk warnings                                       |
| `cargo test`                                       | Pass — 34 active tests, 1 ignored performance test   | Pass — 39 active tests, 1 ignored performance test               |
| macOS Clippy with warnings denied                  | Pass                                                 | Pass with all targets/features                                   |
| `pnpm audit:theme`                                 | **Fail** — two context-menu literals                 | Pass                                                             |
| `pnpm audit`                                       | **Advisory** — 1 high development-only vulnerability | Pass — no known vulnerabilities                                  |
| `pnpm audit --prod`                                | Pass                                                 | Pass — no known vulnerabilities                                  |
| `gitleaks git -v --redact=100 .`                   | Not run — missing                                    | Pass — checksum-verified ephemeral 8.30.1 scan, no leaks         |
| `cargo audit`                                      | Not run — missing                                    | Not run — missing                                                |
| `cargo deny check`                                 | Not run — missing                                    | Not run — missing                                                |
| Latest GitHub CI                                   | **Fail**; Rust stages skipped                        | Hardened workflow is unrun                                       |
| Native Windows/Linux Clippy and packages           | Not run; source defects confirmed                    | Source defects fixed; native validation pending                  |
| macOS ARM release-mode Tauri application bundle    | Not part of original audit                           | Pass                                                             |
| Workflow YAML/pinning/tag/draft behavior checks    | Not part of original audit                           | Local checks pass; first hosted run and `actionlint` pending     |
| Public documentation formatting and relative links | Not part of original audit                           | Pass; screenshots and security-feature enablement remain pending |

## Final recommendation

**NO-GO for public visibility today.**

The current working tree has remediated the licensing, bundled notices, proprietary-font fixture, Tauri path/link/CSP/capability issues, known build defects, JavaScript advisory, workflow supply chain, and public documentation findings through Phase 5. No live secret was found by the original manual scans.

The remaining blockers are cargo-audit/cargo-deny, native Linux and Windows validation, controlled replacement of the private remote refs, the first hosted CI/release-workflow run, GitHub environment/tag/security/branch settings, installer notice inspection, and maintainer-supplied screenshots. Make the repository public only after those checks pass or each residual risk is explicitly accepted in writing.
