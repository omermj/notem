# Release guide

Normal pull-request and `main` branch CI runs on one Linux runner and does not build native installers or updater artifacts. Releases are always initiated explicitly. Choose either the local native build process for inspection or the manually dispatched GitHub-hosted workflow for the controlled draft release.

## 1. Choose and apply the version

Use the selected stable semantic version `0.2.1` (or the next version selected for a later release), with an exact `vX.Y.Z` Git tag. The updater release workflow intentionally rejects prerelease and build-metadata tags.

Update the version in all three files:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Run a Cargo command after changing `Cargo.toml` so that the NoteM entry in `src-tauri/Cargo.lock` is updated too.

## 2. Validate the release commit

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm audit:theme
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
node scripts/verify-release-version.mjs v0.2.1
```

Commit the version change and ensure the working tree contains exactly what should be released.

## 3. Tag the release commit

Replace `0.2.1` with the version being released:

```sh
git tag -a v0.2.1 -m "NoteM v0.2.1"
git push origin v0.2.1
```

Only annotated tags are accepted by the hosted release workflow. Pushing the tag does not start a release workflow.

Before the first hosted public release, configure these GitHub repository controls:

- Protect tags matching `v*` with a ruleset that prevents unauthorized updates and deletion.
- Create a `release` Actions environment and require maintainer approval before deployment. Prevent self-review where the repository plan supports it.

The workflow references this environment, but its reviewer and tag protections are repository settings and are not defined by workflow YAML. GitHub Free does not expose rulesets for this repository while it is private; if the plan is not upgraded, enable the ruleset immediately after changing visibility and before adding collaborators or dispatching the release workflow.

## 4. Configure updater signing

NoteM uses Tauri updater signatures to authenticate update payloads. This is separate from Apple notarization and Windows publisher code signing. The public key is embedded in `src-tauri/tauri.conf.json` and may be distributed. The private key and its password must never be committed, pasted into an issue, or placed in the repository workspace.

Generate the key once on a trusted machine. The command prompts for the key password:

```sh
mkdir -p ~/.tauri
pnpm tauri signer generate -w ~/.tauri/notem-updater.key
chmod 600 ~/.tauri/notem-updater.key
```

Keep the generated private key outside the repository. Record the public key in the base Tauri configuration only after independently checking it against the generated key. Keep the private key and password in an independent encrypted backup; a single local copy is not sufficient.

Before dispatching the hosted workflow, configure these existing repository Actions secrets:

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The workflow passes them only to the platform bundle build step, directly as environment variables. It fails with a clear message when either secret is absent and does not write the key to the workspace. Pull-request CI and `.github/workflows/native-validation.yml` do not require or reference either secret.

The base configuration keeps `bundle.createUpdaterArtifacts` set to `false`. Only `.github/workflows/release.yml` passes `--config src-tauri/tauri.updater.conf.json`, so normal development and validation builds do not create signed updater files.

## 5. Choose a build method

### Option A: build on native machines for inspection

This option uses no GitHub-hosted Actions minutes. Build every installer from the same tag and inspect the results locally. Use the hosted workflow for the final exact staging, manifest, checksum, and draft-release upload.

On each build machine:

```sh
git fetch --tags
git switch --detach v0.2.1
pnpm install --frozen-lockfile
node scripts/verify-release-version.mjs v0.2.1
```

The working tree must be clean before building.

#### Linux x64 on Fedora

Install the required system packages, then build:

```sh
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel \
  libxdo-devel \
  patchelf \
  fuse-libs
sudo dnf group install "c-development"
export TAURI_SIGNING_PRIVATE_KEY="$(< ~/.tauri/notem-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="use-the-key-password"
pnpm tauri build --bundles appimage,deb --config src-tauri/tauri.updater.conf.json
```

For broad AppImage compatibility, build on the oldest Linux base you intend to support. The hosted release workflow uses Ubuntu 22.04 for this reason; a build made on a newer Fedora release may require newer system libraries.

Artifacts:

```text
src-tauri/target/release/bundle/appimage/NoteM_<version>_amd64.AppImage
src-tauri/target/release/bundle/appimage/NoteM_<version>_amd64.AppImage.sig
src-tauri/target/release/bundle/deb/NoteM_<version>_amd64.deb
```

#### macOS ARM

On an Apple Silicon Mac:

```sh
rustup target add aarch64-apple-darwin
export TAURI_SIGNING_PRIVATE_KEY="$(< ~/.tauri/notem-updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="use-the-key-password"
pnpm tauri build --target aarch64-apple-darwin --bundles app,dmg --config src-tauri/tauri.updater.conf.json
```

Artifact:

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/NoteM_<version>_aarch64.dmg
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NoteM.app.tar.gz
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/NoteM.app.tar.gz.sig
```

#### Windows x64

From a Windows developer shell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $env:USERPROFILE\.tauri\notem-updater.key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "use-the-key-password"
pnpm tauri build --bundles nsis --config src-tauri/tauri.updater.conf.json
```

Artifact:

```text
src-tauri\target\release\bundle\nsis\NoteM_<version>_x64-setup.exe
src-tauri\target\release\bundle\nsis\NoteM_<version>_x64-setup.exe.sig
```

#### Create a local draft only when reproducing the hosted staging

Authenticate GitHub CLI if necessary, then create the draft once:

```sh
gh auth login
gh release create v0.2.1 \
  --repo omermj/notem \
  --verify-tag \
  --generate-notes \
  --draft
```

Upload each generated installer directly from the machine that built it:

```sh
gh release upload v0.2.1 path/to/generated-installer \
  --repo omermj/notem
```

Repeat the upload command for the eight exact public assets: the AppImage, DEB, DMG, NSIS installer, the AppImage signature, the macOS `app.tar.gz` updater payload and signature, and the NSIS signature. Generate `latest.json` from the six updater payload/signature files with `scripts/generate-updater-manifest.mjs`, then run `scripts/generate-sha256sums.mjs` over the flat public asset directory. The hosted workflow performs these checks automatically and is preferred for the final release.

For a checksum check over an already staged flat directory, use the repository-owned generator:

```sh
node scripts/generate-sha256sums.mjs path/to/flat-public-assets
gh release upload v0.2.1 path/to/flat-public-assets/SHA256SUMS --repo omermj/notem
```

The script excludes `SHA256SUMS` itself and covers every other non-empty public asset, including `latest.json` and all updater signatures.

### Option B: manually dispatch the hosted release workflow

This option consumes GitHub-hosted Linux, macOS, and Windows runner minutes, but only when explicitly requested.

1. Confirm the `v*` tag ruleset and protected `release` environment are active.
2. Open **GitHub → Actions → Build draft release**.
3. Select **Run workflow**.
4. Enter the existing annotated tag, such as `v0.2.1`.
5. Review and approve the final `release` environment deployment after all three builds pass.

The workflow validates the tag through the GitHub API before checkout, resolves it to a commit SHA, and gives the platform build jobs read-only repository access. Those jobs verify the application version, run native tests and Clippy, build with the release-only updater overlay and step-scoped signing secrets, validate legal files and the Windows GUI subsystem, and upload short-lived Actions artifacts. A separate environment-gated job rechecks that the tag did not move, downloads all three platform artifacts, rejects missing, duplicate, ambiguous, empty, or unexpected files, obtains deterministic notes, derives `pub_date` from the immutable annotated tag timestamp, generates `latest.json`, generates `SHA256SUMS`, and creates or updates only a draft GitHub Release. It refuses to modify an already-published release and never publishes a draft automatically.

Uploading updater files to a draft does not activate the updater. The application reads `latest.json` from GitHub's `/releases/latest/download/latest.json` endpoint, which resolves to the latest published stable release; a draft is not visible there.

## 6. Review and publish

Download and smoke-test every uploaded installer before publishing:

```sh
gh release view v0.2.1 --repo omermj/notem --web
```

Verify the eight installer/updater assets and `latest.json` against `SHA256SUMS`. Confirm that `latest.json` has the validated version, the immutable annotated-tag `pub_date`, exactly the three platform keys, exact non-empty signature contents, and binary URLs under `releases/download/<tag>/`. No binary URL may contain `/latest/download/`; only the manifest endpoint uses that stable alias.

Publish the reviewed draft:

```sh
gh release edit v0.2.1 --repo omermj/notem --draft=false
```

The equivalent web flow is **GitHub repository → Releases → edit the draft → Publish release**.

Publication is deliberately separate from the workflow. Once the draft becomes GitHub's latest stable release, the fixed manifest endpoint becomes visible to installed applications. Do not publish automatically or publish before native installer smoke tests pass.

## 7. Updater behavior and bootstrap

- Linux AppImage installations can download and install updates automatically through the native updater. Debian/DEB installations can check for updates, but their update action opens the fixed GitHub release page for a manual DEB download and installation.
- macOS Apple Silicon installations use the signed `app.tar.gz` updater payload; the DMG remains the initial installer.
- Windows x86-64 installations use the signed NSIS executable updater payload; the normal NSIS executable remains the initial installer.
- The first updater-enabled release must be installed manually. After installing it, publish a later test release and perform a real update check, download, signature verification, and installation on each supported platform. A draft release is not a valid updater test because it is not served by `/releases/latest/download/latest.json`.
- If the private signing key is lost, existing installations cannot accept newly signed updates. Recover the independently backed-up key and password; do not generate a replacement key unless the application is deliberately changed to trust a new public key and users are given a manual migration path.
- Keep at least one independent encrypted backup of the private key and password. The public key may be shared; the private key may not.

## Signing status

- macOS builds currently use ad-hoc signing and are not notarized. Gatekeeper may warn users.
- Windows code signing is not configured. SmartScreen may warn users.
- Tauri updater payloads and their `.sig` files are signed by the configured updater key. This does not provide Apple notarization, Windows publisher code signing, or package-manager repository signing for the DEB.

These operating-system signing limitations may be acceptable for private development testing. Configure production code signing and macOS notarization before treating the installers as a public production release.
