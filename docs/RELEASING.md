# Release guide

Normal pull-request and `main` branch CI runs on one Linux runner and does not build native installers. Releases are always initiated explicitly. Choose either the zero-hosted-minute local process or the manually dispatched GitHub-hosted workflow.

## 1. Choose and apply the version

Use semantic versions such as `0.2.0`, with a Git tag prefixed by `v`.

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
node scripts/verify-release-version.mjs v0.2.0
```

Commit the version change and ensure the working tree contains exactly what should be released.

## 3. Tag the release commit

Replace `0.2.0` with the version being released:

```sh
git tag -a v0.2.0 -m "NoteM v0.2.0"
git push origin v0.2.0
```

Only annotated tags are accepted by the hosted release workflow. Pushing the tag does not start a release workflow.

Before the first hosted public release, configure these GitHub repository controls:

- Protect tags matching `v*` with a ruleset that prevents unauthorized updates and deletion.
- Create a `release` Actions environment and require maintainer approval before deployment. Prevent self-review where the repository plan supports it.

The workflow references this environment, but its reviewer and tag protections are repository settings and are not defined by workflow YAML. GitHub Free does not expose rulesets for this repository while it is private; if the plan is not upgraded, enable the ruleset immediately after changing visibility and before adding collaborators or dispatching the release workflow.

## 4. Choose a build method

### Option A: build on native machines

This option uses no GitHub-hosted Actions minutes. Build every installer from the same tag. On each build machine:

```sh
git fetch --tags
git switch --detach v0.2.0
pnpm install --frozen-lockfile
node scripts/verify-release-version.mjs v0.2.0
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
pnpm tauri build --bundles appimage,deb
```

For broad AppImage compatibility, build on the oldest Linux base you intend to support. The hosted release workflow uses Ubuntu 22.04 for this reason; a build made on a newer Fedora release may require newer system libraries.

Artifacts:

```text
src-tauri/target/release/bundle/appimage/*.AppImage
src-tauri/target/release/bundle/deb/*.deb
```

#### macOS ARM

On an Apple Silicon Mac:

```sh
rustup target add aarch64-apple-darwin
pnpm tauri build --target aarch64-apple-darwin --bundles dmg
```

Artifact:

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

#### Windows x64

From a Windows developer shell:

```powershell
pnpm tauri build --bundles nsis
```

Artifact:

```text
src-tauri\target\release\bundle\nsis\*.exe
```

#### Create the draft and upload from each machine

Authenticate GitHub CLI if necessary, then create the draft once:

```sh
gh auth login
gh release create v0.2.0 \
  --repo omermj/notem \
  --verify-tag \
  --generate-notes \
  --draft
```

Upload each generated installer directly from the machine that built it:

```sh
gh release upload v0.2.0 path/to/generated-installer \
  --repo omermj/notem
```

Repeat the upload command for the AppImage, Debian package, DMG, and NSIS installer. Generate and upload a `SHA256SUMS` file covering every installer before publication. On a POSIX build host, one suitable command is:

```sh
sha256sum NoteM*.AppImage NoteM*.deb NoteM*.dmg NoteM*.exe > SHA256SUMS
gh release upload v0.2.0 SHA256SUMS --repo omermj/notem
```

Adjust the filenames to the downloaded artifacts. On macOS, use `shasum -a 256` if `sha256sum` is unavailable.

### Option B: manually dispatch the hosted release workflow

This option consumes GitHub-hosted Linux, macOS, and Windows runner minutes, but only when explicitly requested.

1. Confirm the `v*` tag ruleset and protected `release` environment are active.
2. Open **GitHub → Actions → Build draft release**.
3. Select **Run workflow**.
4. Enter the existing annotated tag, such as `v0.2.0`.
5. Review and approve the final `release` environment deployment after all three builds pass.

The workflow validates the tag through the GitHub API before checkout, resolves it to a commit SHA, and gives the platform build jobs read-only repository access. Those jobs verify the application versions, build installers, and upload short-lived Actions artifacts. A separate environment-gated job rechecks that the tag did not move, creates or updates a draft GitHub Release, and uploads the installers with `SHA256SUMS`. It refuses to modify an already-published release and never publishes a draft automatically.

## 5. Review and publish

Download and smoke-test every uploaded installer before publishing:

```sh
gh release view v0.2.0 --repo omermj/notem --web
```

Verify each download against `SHA256SUMS`, confirm the release remains tied to the intended tag, and include the signing status below in the public release notes.

Publish the reviewed draft:

```sh
gh release edit v0.2.0 --repo omermj/notem --draft=false
```

The equivalent web flow is **GitHub repository → Releases → edit the draft → Publish release**.

## Signing status

- macOS builds currently use ad-hoc signing and are not notarized. Gatekeeper may warn users.
- Windows code signing is not configured. SmartScreen may warn users.
- Linux packages are not cryptographically signed by a release key.

These warnings may be acceptable for private development testing. Configure production signing and macOS notarization before treating the installers as a public production release.
