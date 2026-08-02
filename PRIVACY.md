# Privacy

NoteM is a local-first desktop application. It has no account system, telemetry, analytics, advertising, or cloud synchronization. Update checking is optional: the first updater-enabled launch asks whether to enable automatic checks or use manual checks only.

## Data stored on the device

NoteM reads and writes files only after you select a vault or explicitly import content. A vault contains:

- Markdown notes and attachments that you control.
- `<vault>/.notem/index.db`, a disposable SQLite/FTS5 index derived from the notes.
- `<vault>/.notem/settings.json`, which stores vault-specific workspace state.

Application-wide preferences, including the last-vault path, appearance, editor preferences, and hotkeys, are stored in the platform application-config directory as `settings.json`. Window position and size are stored through Tauri’s platform window-state support.

Deleting `.notem/` removes derived metadata and vault-specific settings, not the Markdown source files. NoteM recreates the index when the vault is opened again.

## Network behavior

The application does not send notes, index contents, settings, usage data, or identifiers to the NoteM project. PDF.js resources, fonts, character maps, and English spellcheck dictionaries are bundled with the application and loaded locally.

Update checks contact only the fixed HTTPS endpoint `https://github.com/omermj/notem/releases/latest/download/latest.json`, through the native Tauri updater. No request is made before the first-run choice. Manual checks run only when the user asks; optional automatic checks run in the background at most once in any rolling 24-hour period, with the attempt recorded before the request starts. The updater uses the installed version and platform locally to compare releases and select an artifact. GitHub receives the normal network information and standard updater request headers associated with the request. NoteM does not send notes, vault paths, settings, usage data, identifiers, index contents, or telemetry.

The native updater verifies downloaded artifacts against the public key bundled in NoteM before installation. Downloading or installing never happens in the background: installation is user-triggered from the in-app update controls, and pending note edits are saved first. Automatic installation is available for macOS, Windows, and Linux AppImage installations. Debian and other non-AppImage Linux installations can check for updates and show notifications, but their download action opens the fixed GitHub release page instead of replacing the package in place.

When you deliberately activate an `http`, `https`, or `mailto` link, NoteM asks the operating system to open it in the default application. The destination application or website then operates under its own privacy policy. Unsupported URL schemes are not opened from rendered note content.

Downloading NoteM, viewing the GitHub repository, or submitting an issue or security report takes place through GitHub and is subject to GitHub’s policies. Operating systems or distribution services may independently collect crash or reputation information; NoteM does not receive that data.

## Clipboard and file dialogs

NoteM can write a path to the system clipboard when you explicitly choose the corresponding interface action. Native file and folder dialogs are used only for user-initiated vault selection and imports.

## Removing data

Uninstalling NoteM does not delete vaults. Remove vault files using normal filesystem tools only after making any desired backup. Application preferences can be removed from the operating system’s application-config directory after uninstalling.

## Signing and platform warnings

Updater artifact signing verifies the update payload; it does not amount to Apple notarization or Windows publisher signing. The current macOS builds may still trigger Gatekeeper warnings, and Windows builds may still trigger SmartScreen warnings. Linux package managers may apply their own trust and privilege prompts.

Material privacy changes will be documented in the repository and release notes. NoteM continues to have no telemetry or account service.
