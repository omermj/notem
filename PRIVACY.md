# Privacy

NoteM is a local-first desktop application. It has no account system, telemetry, analytics, advertising, or cloud synchronization. The updater foundation does not perform a startup check or show update prompts in this phase.

## Data stored on the device

NoteM reads and writes files only after you select a vault or explicitly import content. A vault contains:

- Markdown notes and attachments that you control.
- `<vault>/.notem/index.db`, a disposable SQLite/FTS5 index derived from the notes.
- `<vault>/.notem/settings.json`, which stores vault-specific workspace state.

Application-wide preferences, including the last-vault path, appearance, editor preferences, and hotkeys, are stored in the platform application-config directory as `settings.json`. Window position and size are stored through Tauri’s platform window-state support.

Deleting `.notem/` removes derived metadata and vault-specific settings, not the Markdown source files. NoteM recreates the index when the vault is opened again.

## Network behavior

The application does not send notes, index contents, settings, usage data, or identifiers to the NoteM project. PDF.js resources, fonts, character maps, and English spellcheck dictionaries are bundled with the application and loaded locally.

When an update check is explicitly requested by the updater service, the native Tauri updater contacts only the fixed HTTPS endpoint `https://github.com/omermj/notem/releases/latest/download/latest.json`. The native updater supplies the platform and installed-version information needed to select an artifact; NoteM does not send vault contents, note text, settings, or telemetry. Update signatures are verified against the public key bundled in the application. Settings migration alone does not contact the endpoint, and the webview does not make the updater request.

When you deliberately activate an `http`, `https`, or `mailto` link, NoteM asks the operating system to open it in the default application. The destination application or website then operates under its own privacy policy. Unsupported URL schemes are not opened from rendered note content.

Downloading NoteM, viewing the GitHub repository, or submitting an issue or security report takes place through GitHub and is subject to GitHub’s policies. Operating systems or distribution services may independently collect crash or reputation information; NoteM does not receive that data.

## Clipboard and file dialogs

NoteM can write a path to the system clipboard when you explicitly choose the corresponding interface action. Native file and folder dialogs are used only for user-initiated vault selection and imports.

## Removing data

Uninstalling NoteM does not delete vaults. Remove vault files using normal filesystem tools only after making any desired backup. Application preferences can be removed from the operating system’s application-config directory after uninstalling.

## Changes

Material privacy changes will be documented in the repository and release notes. The complete user-facing update experience and its consent/notification policy remain Phase 2 work.
