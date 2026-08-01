<script lang="ts">
  import { mount, onMount, unmount } from "svelte";
  import { attachment_resolve, errorMessage, url_open_external } from "../api";
  import { resolveVaultAsset } from "../editor/paths";
  import { renderMarkdown } from "../markdown";
  import {
    activeTab,
    findPane,
    setTagFilter,
    showToast,
    updateTabPosition,
  } from "../stores/ui.svelte";
  import { settingsState } from "../stores/settings.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import { splitFrontmatter } from "../markdown/frontmatter";
  import { readingLinkAction } from "../readingLinks";
  import PdfEmbed from "./PdfEmbed.svelte";

  let { path, paneId: _paneId }: { path: string; paneId: string } = $props();
  let readingHost: HTMLElement;
  let mountedEmbeds: ReturnType<typeof mount>[] = [];
  const file = $derived(vaultState.files[path]);
  const body = $derived(splitFrontmatter(file?.content ?? "").body);
  const html = $derived(
    renderMarkdown(body, {
      imageUrl: (relativePath) =>
        vaultState.path
          ? resolveVaultAsset(vaultState.path, path, relativePath)
          : relativePath,
    }),
  );

  function handleClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (link) {
      event.preventDefault();
      event.stopPropagation();
    }
    const wikilink = target.closest<HTMLElement>("[data-wikilink]");
    if (wikilink?.dataset.wikilink) {
      void vaultState
        .openWikilink(
          wikilink.dataset.wikilink,
          event.metaKey || event.ctrlKey,
          path,
        )
        .catch((error: unknown) => showToast(errorMessage(error)));
      return;
    }
    const tag = target.closest<HTMLElement>("[data-tag]");
    if (tag?.dataset.tag) {
      setTagFilter(tag.dataset.tag);
      return;
    }
    const destination = link?.getAttribute("href");
    if (!destination) return;
    const action = readingLinkAction(destination);
    if (action.kind === "external") {
      void url_open_external(action.url).catch((error: unknown) =>
        showToast(errorMessage(error)),
      );
      return;
    }
    if (action.kind !== "pdf") return;
    void attachment_resolve(path, action.target.source)
      .then(async (resolution) => {
        if (resolution.status === "resolved" && resolution.path) {
          await vaultState.openPdf(
            resolution.path,
            action.target.page,
            event.metaKey || event.ctrlKey,
          );
        } else {
          showToast(
            resolution.status === "ambiguous"
              ? `More than one file matches ${action.target.source}`
              : `PDF not found: ${action.target.source}`,
          );
        }
      })
      .catch((error: unknown) => showToast(errorMessage(error)));
  }

  function clearEmbeds(): void {
    for (const component of mountedEmbeds) void unmount(component);
    mountedEmbeds = [];
  }

  $effect(() => {
    const hasRenderedContent = html.length > 0;
    if (!readingHost) return;
    clearEmbeds();
    if (!hasRenderedContent) return;
    for (const placeholder of readingHost.querySelectorAll<HTMLElement>(
      "[data-pdf-embed]",
    )) {
      const target = placeholder.dataset.pdfEmbed;
      if (!target) continue;
      mountedEmbeds.push(
        mount(PdfEmbed, {
          target: placeholder,
          props: { sourcePath: path, target },
        }),
      );
    }
    return clearEmbeds;
  });

  function handleImageError(event: Event): void {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.add("image-load-failed");
    event.target.title =
      event.target.dataset.imageError ?? "Image could not be loaded";
  }

  function handleImageLoad(event: Event): void {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.classList.remove("image-load-failed");
    event.target.removeAttribute("title");
  }

  onMount(() => {
    readingHost.addEventListener("click", handleClick);
    readingHost.addEventListener("error", handleImageError, true);
    readingHost.addEventListener("load", handleImageLoad, true);
    const tab = activeTab(findPane(_paneId));
    readingHost.scrollTop = tab?.scrollTop ?? 0;
    const scroll = () =>
      updateTabPosition(_paneId, tab?.cursor ?? 0, readingHost.scrollTop);
    readingHost.addEventListener("scroll", scroll);
    return () => {
      clearEmbeds();
      readingHost.removeEventListener("click", handleClick);
      readingHost.removeEventListener("error", handleImageError, true);
      readingHost.removeEventListener("load", handleImageLoad, true);
      readingHost.removeEventListener("scroll", scroll);
    };
  });
</script>

<article
  bind:this={readingHost}
  class:readable-line-length={settingsState.readableLineLength}
  class="reading-view"
  style={`font-size: ${settingsState.editorFontSize}px; --note-line-width: ${settingsState.editorLineWidth}ch`}
>
  <!-- MarkdownIt runs with raw HTML disabled; custom tokens escape attributes/content. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html}
</article>
