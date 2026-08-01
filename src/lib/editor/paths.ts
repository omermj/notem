import { convertFileSrc } from "@tauri-apps/api/core";

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif)$/i;

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.test(path.split(/[?#]/, 1)[0]);
}

export function cleanMarkdownDestination(source: string): string {
  const trimmed = source.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

export function resolveVaultAsset(
  vaultPath: string,
  notePath: string,
  source: string,
): string | null {
  const destination = cleanMarkdownDestination(source);
  if (/^https?:\/\//i.test(destination)) return destination;
  if (/^(?:blob:|data:image\/)/i.test(destination)) return destination;
  if (/^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith("#")) {
    return null;
  }

  const suffixIndex = destination.search(/[?#]/);
  const encodedPath =
    suffixIndex < 0 ? destination : destination.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : destination.slice(suffixIndex);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }

  const base = decodedPath.startsWith("/")
    ? []
    : notePath.replaceAll("\\", "/").split("/").slice(0, -1);
  for (const part of decodedPath.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!base.length) return null;
      base.pop();
    } else {
      base.push(part);
    }
  }
  if (!base.length) return null;
  const separator = vaultPath.includes("\\") ? "\\" : "/";
  const absolute = `${vaultPath.replace(/[\\/]+$/, "")}${separator}${base.join(separator)}`;
  return `${convertFileSrc(absolute)}${suffix}`;
}

export function resolveVaultFile(
  vaultPath: string,
  relativePath: string,
): string | null {
  return resolveVaultAsset(vaultPath, "", `/${relativePath}`);
}

export function relativeVaultPath(
  notePath: string,
  assetPath: string,
): string | null {
  const noteDirectory = notePath.replaceAll("\\", "/").split("/").slice(0, -1);
  const asset = assetPath.replaceAll("\\", "/").split("/");
  if (asset.some((part) => !part || part === "." || part === "..")) return null;
  let common = 0;
  while (
    common < noteDirectory.length &&
    common < asset.length &&
    noteDirectory[common] === asset[common]
  ) {
    common += 1;
  }
  return [
    ...Array.from({ length: noteDirectory.length - common }, () => ".."),
    ...asset.slice(common),
  ].join("/");
}

export function markdownImage(path: string, alt = ""): string {
  const escapedPath = path
    .replaceAll("%", "%25")
    .replaceAll("#", "%23")
    .replaceAll("?", "%3F")
    .replaceAll("<", "%3C")
    .replaceAll(">", "%3E");
  const escapedAlt = alt.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
  return `![${escapedAlt}](<${escapedPath}>)`;
}

export function imageAlt(path: string): string {
  const name = path.replaceAll("\\", "/").split("/").at(-1) ?? "Image";
  return name.replace(IMAGE_EXTENSIONS, "");
}
