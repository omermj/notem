#!/usr/bin/env bash
#
# Remove the bundled libwayland-client.so.0 from a NoteM Linux AppImage.
#
# Tauri's AppImage packaging bundles libwayland-client.so.0 from the build
# host (Ubuntu 22.04). On modern Fedora, the host Mesa/EGL stack loads that
# older client library instead of the system one and WebKitGTK aborts with
# "Could not create default EGL display: EGL_BAD_PARAMETER". Using the host
# libwayland-client.so.0 fixes the startup crash; the library's soname has
# been stable for every release, so distros that can run the AppImage at all
# always provide it.
#
# Usage: scripts/fix-linux-appimage.sh <path/to/NoteM_x.y.z_amd64.AppImage>
#
# The script extracts the AppImage, deletes every file or symlink matching
# libwayland-client.so.0*, repacks the AppDir over the original file, and
# removes the now-invalid .AppImage.sig next to it. The caller must re-sign
# the repacked AppImage (pnpm tauri signer sign) before publishing it.
#
# Repacking uses pinned, checksum-verified upstream release artifacts from
# the official AppImage organization:
#   - appimagetool 1.9.1 (AppImage/appimagetool)
#   - type 2 runtime 20251108 (AppImage/type2-runtime)
# Set APPIMAGETOOL_BIN and APPIMAGE_RUNTIME_FILE to bypass the downloads.

set -euo pipefail

APPIMAGETOOL_VERSION="1.9.1"
APPIMAGETOOL_URL="https://github.com/AppImage/appimagetool/releases/download/${APPIMAGETOOL_VERSION}/appimagetool-x86_64.AppImage"
APPIMAGETOOL_SHA256="ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0"
RUNTIME_VERSION="20251108"
RUNTIME_URL="https://github.com/AppImage/type2-runtime/releases/download/${RUNTIME_VERSION}/runtime-x86_64"
RUNTIME_SHA256="2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d"

BUNDLED_LIBRARY_NAME="libwayland-client.so.0"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "this script only patches Linux AppImages; current OS is $(uname -s)."
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path/to/NoteM_x.y.z_amd64.AppImage>" >&2
  exit 1
fi

appimage="$(realpath "$1" 2>/dev/null)" ||
  fail "AppImage not found: $1"
signature="${appimage}.sig"

if [[ ! -f "$appimage" ]]; then
  fail "AppImage not found: $appimage"
fi

magic="$(head -c 12 "$appimage" | od -A n -t x1 | tr -d ' \n')"
if [[ "$magic" != "7f454c460201010041490200" ]]; then
  fail "not a type 2 AppImage (unexpected magic bytes $magic): $appimage"
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/notem-appimage-fix.XXXXXX")"
trap 'rm -rf -- "$workdir"' EXIT INT TERM

fetch_pinned_file() {
  local url="$1" expected_sha256="$2" destination="$3" actual_sha256
  echo "Downloading pinned release artifact: $url"
  curl --fail --location --silent --show-error --retry 3 \
    --output "$destination" "$url"
  actual_sha256="$(sha256sum "$destination" | awk '{print $1}')"
  if [[ "$actual_sha256" != "$expected_sha256" ]]; then
    fail "checksum mismatch for $url: expected $expected_sha256, got $actual_sha256"
  fi
}

appimagetool_bin="${APPIMAGETOOL_BIN:-}"
runtime_file="${APPIMAGE_RUNTIME_FILE:-}"
if [[ -z "$appimagetool_bin" ]]; then
  fetch_pinned_file "$APPIMAGETOOL_URL" "$APPIMAGETOOL_SHA256" \
    "$workdir/appimagetool"
  appimagetool_bin="$workdir/appimagetool"
fi
if [[ -z "$runtime_file" ]]; then
  fetch_pinned_file "$RUNTIME_URL" "$RUNTIME_SHA256" "$workdir/runtime-x86_64"
  runtime_file="$workdir/runtime-x86_64"
fi
for tool in "$appimagetool_bin" "$runtime_file"; do
  if [[ ! -f "$tool" ]]; then
    fail "required tool not found: $tool"
  fi
  chmod +x "$tool"
done

echo "Extracting $appimage"
(
  cd "$workdir"
  "$appimage" --appimage-extract >/dev/null
)
appdir="$workdir/squashfs-root"
if [[ ! -x "$appdir/AppRun" ]]; then
  fail "extraction did not produce a usable AppDir with an executable AppRun: $appdir"
fi

matches="$(find "$appdir" \( -type f -o -type l \) -name "${BUNDLED_LIBRARY_NAME}*" || true)"
if [[ -z "$matches" ]]; then
  echo "No bundled ${BUNDLED_LIBRARY_NAME}* found in $appimage; leaving it unchanged."
  exit 0
fi
echo "Removing bundled ${BUNDLED_LIBRARY_NAME}* from the AppImage:"
while IFS= read -r match; do
  echo "  ${match#"$appdir/"}"
  rm -f -- "$match"
done <<<"$matches"

remaining="$(find "$appdir" \( -type f -o -type l \) -name "${BUNDLED_LIBRARY_NAME}*" || true)"
if [[ -n "$remaining" ]]; then
  fail "bundled ${BUNDLED_LIBRARY_NAME}* still present after removal: $remaining"
fi

repacked="$workdir/repacked.AppImage"
echo "Repacking $appimage"
# APPIMAGE_EXTRACT_AND_RUN=1 lets appimagetool run without FUSE; ARCH is
# required when the AppDir layout does not expose the target architecture.
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 \
  "$appimagetool_bin" -n --runtime-file "$runtime_file" \
  "$appdir" "$repacked" >/dev/null

if [[ ! -s "$repacked" ]]; then
  fail "repacking produced an empty AppImage"
fi
original_mode="$(stat -c '%a' "$appimage")"
chmod "$original_mode" "$repacked"

# Defense in depth: extract the repacked image and prove the library is gone
# before it can replace the original artifact.
verification_dir="$workdir/verification"
mkdir "$verification_dir"
(
  cd "$verification_dir"
  "$repacked" --appimage-extract >/dev/null
)
leaked="$(find "$verification_dir/squashfs-root" \( -type f -o -type l \) -name "${BUNDLED_LIBRARY_NAME}*" || true)"
if [[ -n "$leaked" ]]; then
  fail "repacked AppImage still bundles ${BUNDLED_LIBRARY_NAME}*: $leaked"
fi

mv -f -- "$repacked" "$appimage"
if [[ -e "$signature" ]]; then
  rm -f -- "$signature"
  echo "Removed stale signature $signature; it no longer matches the repacked AppImage."
fi

echo "Fixed $appimage ($(sha256sum "$appimage" | awk '{print $1}'))"
echo "Re-sign it with: pnpm tauri signer sign \"$appimage\""
