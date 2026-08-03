# Threat model

## Security boundary

NoteM is a local desktop application. The installed application and its bundled
frontend are trusted. Vault contents are untrusted: a vault may have been
downloaded, shared, or modified by another process. NoteM must not let a vault
path, Markdown document, attachment, symlink, or rendered link escape the
selected vault or execute code. Update metadata and signed artifacts come
from the fixed HTTPS GitHub endpoint and are verified by the native updater
against the embedded public key before installation.

Note content remains in ordinary files. SQLite contains only derived metadata
and can be deleted and rebuilt. NoteM has no account, telemetry service, cloud
API, remote script, or intentional external webview content. Optional manual
or user-enabled automatic update checks contact one fixed HTTPS GitHub endpoint;
the updater endpoint is a native-plugin boundary, not a webview resource. The
installed version and platform are used locally to compare releases and select
an artifact. The normal network information and standard updater request
headers associated with that request are visible to GitHub, but NoteM does not
send notes, vault paths, settings, usage data, identifiers, or telemetry.

## Filesystem containment

The canonical selected vault root is the filesystem boundary. All
vault-relative paths use forward slashes and reject absolute paths, parent
components, current-directory components, backslashes, and NUL bytes.

Existing paths reject every symbolic-link component before canonicalization.
New paths validate and create each parent directory individually, reject
symbolic links and broken-link destinations, canonicalize the resulting parent,
and reserve final files with create-new semantics. The same boundary covers
notes, imported attachments, `.notem/settings.json`, the SQLite database and
its sidecars, link rewrites, and watcher-driven index updates.

These checks prevent prepared-vault symlink escapes. Like most pathname-based
code, they retain a narrow time-of-check/time-of-use race if another local
process can replace directory components while an operation is running. A
future hardening step may move all vault operations to capability-directory
handles if the threat model expands to a concurrently malicious local process.

## Renderer and IPC

The frontend may invoke filesystem commands only through `src/lib/api.ts`.
Detached note windows have core Tauri permissions only; native dialog,
clipboard-write, and window-state plugin permissions are restricted to the main
window.

The main renderer can pass absolute host paths to vault-open and import commands
after native dialog or drag/drop selection. This is required by the current UX.
A compromised main renderer could invoke those custom commands without a fresh
user gesture. Raw Markdown HTML is disabled, output is escaped, CSP blocks
remote scripts and objects, and no external content is intentionally loaded in
the webview, which reduces the likelihood. Short-lived Rust-issued selection
handles remain a defense-in-depth option.

The updater and process plugin permissions are granted only to the `main`
window. Detached note and PDF windows retain only core permissions, so they
cannot check, download, install, or restart for updates. The updater capability
command only reports whether the current installation can be updated
automatically and whether it owns the post-install restart; Windows and macOS
support automatic installation, Linux supports it only for AppImages, and
other installations use manual download. The Windows native updater launches
the installer and exits the current process, so NoteM does not issue a second
relaunch on that platform.

The first-run consent panel is non-blocking and makes the network boundary
explicit. Automatic checks are recorded before their request and are limited
to one attempt per rolling 24 hours; manual checks bypass that limit. Invalid
timestamps are discarded. If the application clock moves behind a recorded
attempt, NoteM rebases the timestamp to the current clock without making a
request, preserving the 24-hour privacy throttle. Background errors are
suppressed in the routine UI, and no operating-system notification is used.

Release notes and manifest strings are untrusted text and are rendered through
normal escaped Svelte text interpolation; they are never inserted as HTML.
The in-app banner only reports availability. Downloads and installations are
started by an explicit user action. Before installation, NoteM flushes pending
note edits through `vaultState.saveAll()` and blocks the update if saving fails
or a conflict prevents confirmation. The native updater verifies the artifact
signature against the embedded public key before installation. That updater
signature is not Apple notarization or Windows publisher signing, so Gatekeeper
and SmartScreen warnings remain possible.

## Rendered content and navigation

Markdown rendering does not allow raw HTML. Every rendered anchor has its
default browser action cancelled before dispatch. Only HTTP, HTTPS, and mailto
destinations may open in the operating-system handler; only vault-relative PDF
destinations are handled internally. Unsupported, relative non-PDF, fragment,
FTP, file, JavaScript, protocol-relative, and custom-scheme links remain inert.

Production CSP excludes development HTTP and WebSocket origins. Development
origins exist only in `devCsp`. `object-src` is disabled, scripts are self-only,
and JavaScript prototypes are frozen. Inline styles remain allowed because the
current Svelte components use dynamic style attributes. The asset protocol is
enabled only for the canonical vault selected at runtime so local images and
PDFs can render; its recursive scope is intentional and contains no write
permission.
