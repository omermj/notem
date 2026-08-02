# NoteM

NoteM is a lightweight, local-first Markdown knowledge-base app for Linux, macOS, and Windows. It keeps every note as a normal `.md` file in a folder you control. There is no account, cloud dependency, proprietary note format, or telemetry.

> NoteM is under active development. Back up important vaults as you would any other folder.

## Screenshots

| Editing and properties                                          | Knowledge graph                                       |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| _Screenshot placeholder — editor, ribbon, and properties panel_ | _Screenshot placeholder — canvas graph in dark theme_ |

## Project status

NoteM is pre-1.0 software under active development. The private `v0.2.0` build was withdrawn during the open-source readiness review. A cross-platform `v0.2.1` draft was built from the cleaned public tag and is planned as the first public release after maintainer runtime smoke tests. Until then, build from source and keep backups of important vaults.

## Install

Once `v0.2.1` is published, download the package for your platform from [GitHub Releases](https://github.com/omermj/notem/releases). The updater foundation is present, but startup checks and the complete user-facing update experience are not enabled yet.

### Linux x86-64

The release provides an AppImage and a Debian package built on Ubuntu 22.04.

For the AppImage:

```sh
chmod +x NoteM_*.AppImage
./NoteM_*.AppImage
```

Some distributions require the FUSE 2 compatibility package. For the Debian package:

```sh
sudo apt install ./NoteM_*.deb
```

### macOS 11 or newer, Apple Silicon

Open the ARM64 DMG and drag NoteM into **Applications**. The current build is ad-hoc signed but not notarized, so Gatekeeper may warn on first launch. In Finder, Control-click NoteM, choose **Open**, review the warning, and confirm only if the downloaded checksum matches.

### Windows 10 or 11, x86-64

Run the NSIS setup executable. Windows code signing is not configured, so SmartScreen may show an unrecognized-app warning. Confirm the checksum and publisher disclosure before choosing **Run anyway**.

## Supported platforms

| Platform                                                      | Architecture            | Package          | Support level                                |
| ------------------------------------------------------------- | ----------------------- | ---------------- | -------------------------------------------- |
| Ubuntu 22.04 or compatible Linux with WebKitGTK 4.1 and GTK 3 | x86-64                  | AppImage, `.deb` | Supported release target                     |
| Other Linux distributions                                     | x86-64                  | AppImage         | Best effort; ABI and FUSE compatibility vary |
| macOS 11+                                                     | Apple Silicon (`arm64`) | DMG              | Supported release target                     |
| Windows 10/11                                                 | x86-64                  | NSIS `.exe`      | Supported release target                     |

Intel macOS, Linux ARM, Windows ARM, mobile platforms, and 32-bit operating systems are not currently supported. Native Linux x86-64, macOS ARM, and Windows x86-64 tests, strict Clippy, and installer builds pass in the release-validation workflow; the unsigned installers still require maintainer runtime smoke tests before `v0.2.1` is published.

## Verify downloads and signing

Each hosted release is expected to include `SHA256SUMS`. Verify the installer before opening it:

```sh
# Linux
sha256sum -c SHA256SUMS --ignore-missing

# macOS
shasum -a 256 NoteM_*.dmg
```

On Windows PowerShell:

```powershell
Get-FileHash .\NoteM_*.exe -Algorithm SHA256
Get-Content .\SHA256SUMS
```

Compare the Windows/macOS hash exactly with the matching line in `SHA256SUMS`. Checksums detect download corruption or replacement relative to the release page; they are not a substitute for a cryptographic publisher signature.

The initial public release artifacts will not be signed by a trusted release identity: macOS uses ad-hoc signing without notarization, Windows packages are unsigned, and Linux packages have no project release signature. These limitations must also appear in each public release’s notes.

## Features

- Plain-folder Markdown vaults with recursive file browsing
- CodeMirror 6 editor with Markdown live preview and reading view
- Offline PDF viewing in tabs and inline note embeds, with page navigation, zoom, search, rotation, password support, and selectable text
- Wikilinks, backlinks, tags, headings, full-text search, and Canvas graph view
- Daily notes and reusable templates with `{{date}}`, `{{time}}`, and `{{title}}`
- Editable YAML properties with text, number, checkbox, date, list, and tag values
- Tabs, pane splitting, history, quick switcher, command palette, and configurable hotkeys
- Light, dark, and system themes with a custom accent color
- External-change watching, explicit conflict resolution, binary-file placeholders, and large-file protection
- Restored window size, position, and maximized state
- Single-instance behavior and operating-system “Open with NoteM” registration for `.md`
- Local SQLite FTS5 index that can always be rebuilt from the vault

## Vault format

A vault is an ordinary directory:

```text
My Vault/
├── Home.md
├── Daily/
│   └── 2026-07-25.md
├── Templates/
│   └── Meeting.md
├── attachments/
│   ├── diagram.png
│   └── reference.pdf
└── .notem/
    ├── index.db
    └── settings.json
```

Markdown files are the source of truth. NoteM never stores note content in SQLite. The `.notem/index.db` database contains only disposable metadata and full-text search data; deleting `.notem/` is safe because NoteM recreates it by scanning the Markdown files. Vault-specific workspace state lives in `.notem/settings.json`.

Paths inside NoteM are vault-relative and use `/`. A wikilink such as `[[Projects/NoteM]]` resolves to the corresponding Markdown file without requiring the `.md` suffix.

PDF attachments open in NoteM when selected in the file explorer or through a normal Markdown link. Embed a PDF directly in a note with:

```md
![[attachments/reference.pdf]]
![[attachments/reference.pdf#page=3]]
![[attachments/reference.pdf#height=400]]
![[attachments/reference.pdf#page=3&height=400]]
```

PDFs remain read-only and are never added to the SQLite note index. The viewer and its fonts, character maps, and worker are bundled with NoteM and do not require a network connection.

## File safety

The detailed trust boundaries and residual risks are documented in the
[threat model](docs/THREAT_MODEL.md).

- Files above 2 MB show a performance warning.
- Text files above 10 MB open read-only.
- Binary files remain visible in the vault tree but open as untouched placeholders.
- If a note changes externally while it has local edits, NoteM shows both versions and asks whether to keep the local version or take the disk version.
- If a removable drive disappears, NoteM stops file operations and offers a vault chooser when the drive is available again.

## Privacy

NoteM has no account, telemetry, analytics, advertising, or cloud synchronization. Notes and attachments stay in the selected vault; derived search metadata stays in `<vault>/.notem/`. Application preferences are stored in the operating system’s application-config directory. The updater foundation uses a native HTTPS request to the fixed GitHub release metadata endpoint when explicitly invoked; it does not run at startup in this phase.

HTTP, HTTPS, and email links leave NoteM only when you activate them and are handed to the operating system’s default application. PDF.js resources and spellcheck dictionaries are bundled and loaded locally. See the full [privacy statement](PRIVACY.md) and [threat model](docs/THREAT_MODEL.md).

## Known limitations

- NoteM is pre-1.0; vault and settings migrations may still change between minor releases.
- There is no synchronization, account system, end-to-end encryption, mobile app, plugin marketplace, collaborative editing, complete user-facing updater experience, or PDF export.
- Release signing and notarization are not configured. Review the disclosure and checksum instructions above.
- Only the platforms and architectures in the support table are release targets.
- Files above 10 MB open read-only, and PDFs are view-only.
- NoteM aims for broadly useful Markdown, wikilinks, tags, and frontmatter, but does not promise compatibility with another application’s plugins or proprietary extensions.
- Backups remain the user’s responsibility. The disposable index can be rebuilt, but deleted or overwritten note content cannot be reconstructed from it.

## Keyboard shortcuts

`Mod` means Command on macOS and Ctrl on Linux/Windows. Shortcuts can be rebound in **Settings → Hotkeys**.

| Action                  | Default         |
| ----------------------- | --------------- |
| Open command palette    | `Mod+P`         |
| Open quick switcher     | `Mod+O`         |
| Search all notes        | `Mod+Shift+F`   |
| New note                | `Mod+N`         |
| Save current note       | `Mod+S`         |
| Toggle reading view     | `Mod+E`         |
| Open today’s daily note | `Mod+D`         |
| Insert template         | `Mod+Shift+I`   |
| Open settings           | `Mod+,`         |
| Open vault              | `Mod+Shift+O`   |
| Rebuild index           | `Mod+Shift+R`   |
| Toggle light/dark theme | `Mod+Shift+L`   |
| New tab                 | `Mod+T`         |
| Close tab               | `Mod+W`         |
| Split right             | `Mod+\`         |
| Split down              | `Mod+Shift+\`   |
| Navigate back           | `Mod+Alt+Left`  |
| Navigate forward        | `Mod+Alt+Right` |

## Development

### Prerequisites

- Rust 1.97.1
- Node.js 22.18.0
- pnpm 11.17.0 through Corepack
- The [Tauri 2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)

```sh
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
pnpm tauri dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete contribution workflow and [the architecture overview](docs/ARCHITECTURE.md) before changing filesystem, index, or IPC behavior.

Before submitting a change:

```sh
pnpm check
pnpm test
pnpm lint
pnpm audit:theme
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Type `debug` in the command palette and run **Debug: Show performance timings** to view live startup, index, search, and editor-input measurements. The release-mode 5,000-note audit is:

```sh
cargo test --release --manifest-path src-tauri/Cargo.toml --test performance -- --ignored --nocapture
```

The enforced targets are cold start below 1 second, a 5,000-note index below 3 seconds, editor input processing below 16 ms, and search below 100 ms.

Latest local Apple Silicon audit:

| Metric                                  | Measured |     Target |
| --------------------------------------- | -------: | ---------: |
| Frontend cold load                      |   332 ms | < 1,000 ms |
| Fresh 5,000-note index                  | 2,086 ms | < 3,000 ms |
| FTS query across 5,000 notes            |   6.5 ms |   < 100 ms |
| 100 KB editor transaction, worst of 120 |   2.9 ms |    < 16 ms |

The CI release-mode audit independently enforces the index and search budgets on Linux. Live debug timings cover the actual opened vault and editor session.

## Building packages

Tauri bundles are platform-native and must be produced on their target operating system.

### Linux: AppImage and Debian package

On Debian or Ubuntu, install the Tauri/WebKit build dependencies:

```sh
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libfuse2
pnpm tauri build --bundles appimage,deb
```

Artifacts are written under `src-tauri/target/release/bundle/appimage/` and `src-tauri/target/release/bundle/deb/`.

For Fedora prerequisites and compatibility guidance, see the [release guide](docs/RELEASING.md).

### macOS ARM: DMG

Run on Apple Silicon, or on the `macos-14` GitHub Actions runner:

```sh
rustup target add aarch64-apple-darwin
pnpm tauri build --target aarch64-apple-darwin --bundles dmg
```

The DMG is written under `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`.

The public build is ad-hoc signed but is not notarized with an Apple Developer ID. macOS may warn on first launch; use Finder’s **Open** context-menu action to review and approve the app. Production distribution should replace the ad-hoc identity with Developer ID signing and notarization.

### Windows: NSIS installer

From a Windows developer shell:

```powershell
pnpm tauri build --bundles nsis
```

The installer is written under `src-tauri\target\release\bundle\nsis\`.

## Continuous integration

The [CI workflow](.github/workflows/ci.yml) runs frontend checks, frontend tests, Rust tests, clippy, and the production frontend build on one Linux runner for pull requests and pushes to `main`. Native installers are not built during normal CI. The release-mode performance audit runs only when CI is dispatched manually.

The [draft-release workflow](.github/workflows/release.yml) builds Linux, macOS ARM, and Windows installers only when explicitly dispatched with an existing annotated version tag. Read-only jobs build the tag's resolved commit, then a separate `release` environment job creates or updates the draft and uploads the installers plus `SHA256SUMS`. It never publishes the release automatically. To avoid hosted-runner usage entirely, build on native machines and upload the installers using the [manual release guide](docs/RELEASING.md).

Signing credentials are intentionally not stored in the repository.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report suspected vulnerabilities through the private process in [SECURITY.md](SECURITY.md), not a public issue.

## License

NoteM is licensed under the [MIT License](LICENSE).

Bundled dependencies, fonts, dictionaries, and derived interface glyphs remain
under their respective licenses. See [Third-Party Notices](THIRD_PARTY_NOTICES.md)
for attribution and the complete retained license texts, and see
[Asset provenance](docs/ASSET_PROVENANCE.md) for the bundled-asset inventory.
