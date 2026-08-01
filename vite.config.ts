import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { Plugin } from "vite";

const host = process.env.TAURI_DEV_HOST;
const pdfDistribution = resolve("node_modules/pdfjs-dist");
const pdfAssetDirectories = {
  cmaps: resolve(pdfDistribution, "cmaps"),
  iccs: resolve(pdfDistribution, "iccs"),
  images: resolve(pdfDistribution, "legacy/web/images"),
  standard_fonts: resolve(pdfDistribution, "standard_fonts"),
  wasm: resolve(pdfDistribution, "wasm"),
};
const spellcheckAssets = {
  "en.aff": resolve("node_modules/dictionary-en/index.aff"),
  "en.dic": resolve("node_modules/dictionary-en/index.dic"),
};
const legalAssets = {
  LICENSE: resolve("LICENSE"),
  "THIRD_PARTY_NOTICES.md": resolve("THIRD_PARTY_NOTICES.md"),
};

function pdfAssets(): Plugin {
  return {
    name: "notem-pdf-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://notem.local")
          .pathname;
        const [directory, ...rest] = decodeURIComponent(pathname)
          .replace(/^\/+/, "")
          .split("/");
        const source =
          pdfAssetDirectories[directory as keyof typeof pdfAssetDirectories];
        if (!source || rest.some((part) => !part || part === "..")) {
          next();
          return;
        }
        const file = resolve(source, ...rest);
        if (
          !file.startsWith(`${source}${sep}`) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          next();
          return;
        }
        const contentTypes: Record<string, string> = {
          ".bcmap": "application/octet-stream",
          ".bin": "application/octet-stream",
          ".icc": "application/vnd.iccprofile",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".ttf": "font/ttf",
          ".wasm": "application/wasm",
        };
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          contentTypes[extname(file).toLowerCase()] ??
            "application/octet-stream",
        );
        response.end(readFileSync(file));
      });
    },
    writeBundle(options) {
      const output = resolve(
        typeof options.dir === "string" ? options.dir : "dist",
        "pdfjs",
      );
      mkdirSync(output, { recursive: true });
      for (const [name, source] of Object.entries(pdfAssetDirectories)) {
        cpSync(source, resolve(output, name), { recursive: true });
      }
    },
  };
}

function spellcheckDictionaryAssets(): Plugin {
  return {
    name: "notem-spellcheck-assets",
    configureServer(server) {
      server.middlewares.use("/spellcheck", (request, response, next) => {
        const name = decodeURIComponent(request.url ?? "").replace(/^\/+/, "");
        const source = spellcheckAssets[name as keyof typeof spellcheckAssets];
        if (!source) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(readFileSync(source));
      });
    },
    writeBundle(options) {
      const output = resolve(
        typeof options.dir === "string" ? options.dir : "dist",
        "spellcheck",
      );
      mkdirSync(output, { recursive: true });
      for (const [name, source] of Object.entries(spellcheckAssets)) {
        copyFileSync(source, resolve(output, name));
      }
    },
  };
}

function legalDocumentAssets(): Plugin {
  return {
    name: "notem-legal-assets",
    configureServer(server) {
      server.middlewares.use("/legal", (request, response, next) => {
        const name = decodeURIComponent(request.url ?? "").replace(/^\/+/, "");
        const source = legalAssets[name as keyof typeof legalAssets];
        if (!source) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(readFileSync(source));
      });
    },
    writeBundle(options) {
      const output = resolve(
        typeof options.dir === "string" ? options.dir : "dist",
        "legal",
      );
      mkdirSync(output, { recursive: true });
      for (const [name, source] of Object.entries(legalAssets)) {
        copyFileSync(source, resolve(output, name));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    pdfAssets(),
    spellcheckDictionaryAssets(),
    legalDocumentAssets(),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
