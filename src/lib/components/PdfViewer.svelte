<script lang="ts">
  import { onMount } from "svelte";
  import {
    AnnotationMode,
    GlobalWorkerOptions,
    PasswordResponses,
    getDocument,
    type PDFDocumentLoadingTask,
    type PDFDocumentProxy,
  } from "pdfjs-dist/legacy/build/pdf.mjs";
  import {
    EventBus,
    LinkTarget,
    PDFFindController,
    PDFLinkService,
    PDFViewer as PdfJsViewer,
  } from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
  import "pdfjs-dist/legacy/web/pdf_viewer.css";
  import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
  import { file_open_external, file_reveal, url_open_external } from "../api";
  import { resolveVaultFile } from "../editor/paths";
  import { showToast } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import { errorMessage } from "../api";

  let {
    path,
    initialPage = 1,
    initialScale = "page-width",
    compact = false,
    height,
    onPosition,
  }: {
    path: string;
    initialPage?: number;
    initialScale?: string;
    compact?: boolean;
    height?: number;
    onPosition?: (page: number, scale: string) => void;
  } = $props();

  let container: HTMLDivElement;
  let viewerHost: HTMLDivElement;
  let shell: HTMLElement;
  let loading = $state(true);
  let loadProgress = $state<number | null>(null);
  let failure = $state<string | null>(null);
  let currentPage = $state(1);
  let pageCount = $state(0);
  let scalePercent = $state(100);
  let findOpen = $state(false);
  let findQuery = $state("");
  let findCurrent = $state(0);
  let findTotal = $state(0);
  let pageInput = $state("1");
  let passwordInput = $state("");
  let passwordElement = $state<HTMLInputElement>();
  let passwordRequest = $state<{
    incorrect: boolean;
    update(password: string): void;
    cancel(): void;
  } | null>(null);

  $effect(() => {
    if (!passwordRequest) return;
    requestAnimationFrame(() => passwordElement?.focus());
  });

  let loadingTask: PDFDocumentLoadingTask | null = null;
  let documentProxy: PDFDocumentProxy | null = null;
  let viewer: PdfJsViewer | null = null;
  let eventBus: EventBus | null = null;
  let findController: PDFFindController | null = null;

  GlobalWorkerOptions.workerSrc = workerUrl;
  const pdfAssetBase = new URL("/pdfjs/", window.location.origin).toString();

  interface PageChangingEvent {
    pageNumber: number;
  }

  interface ScaleChangingEvent {
    scale: number;
  }

  interface FindMatchesEvent {
    matchesCount: { current: number; total: number };
  }

  function pageEvent(value: unknown): value is PageChangingEvent {
    return (
      typeof value === "object" &&
      value !== null &&
      "pageNumber" in value &&
      typeof value.pageNumber === "number"
    );
  }

  function scaleEvent(value: unknown): value is ScaleChangingEvent {
    return (
      typeof value === "object" &&
      value !== null &&
      "scale" in value &&
      typeof value.scale === "number"
    );
  }

  function matchesEvent(value: unknown): value is FindMatchesEvent {
    if (
      typeof value !== "object" ||
      value === null ||
      !("matchesCount" in value) ||
      typeof value.matchesCount !== "object" ||
      value.matchesCount === null
    ) {
      return false;
    }
    return (
      "current" in value.matchesCount &&
      "total" in value.matchesCount &&
      typeof value.matchesCount.current === "number" &&
      typeof value.matchesCount.total === "number"
    );
  }

  function boundedPage(value: number): number {
    return Math.max(1, Math.min(pageCount || 1, Math.round(value)));
  }

  function goToPage(value: number): void {
    if (!viewer || pageCount < 1) return;
    viewer.currentPageNumber = boundedPage(value);
  }

  function commitPage(): void {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) goToPage(parsed);
    pageInput = String(currentPage);
  }

  function zoom(factor: number): void {
    if (!viewer || pageCount < 1) return;
    viewer.currentScale = Math.max(
      0.25,
      Math.min(5, viewer.currentScale * factor),
    );
  }

  function fitWidth(): void {
    if (viewer) viewer.currentScaleValue = "page-width";
  }

  function actualSize(): void {
    if (viewer) viewer.currentScaleValue = "page-actual";
  }

  function rotate(): void {
    if (viewer) viewer.pagesRotation = (viewer.pagesRotation + 90) % 360;
  }

  function runFind(findPrevious = false): void {
    if (!eventBus || !findController || !findQuery.trim()) return;
    eventBus.dispatch("find", {
      source: findController,
      type: findPrevious ? "again" : "",
      query: findQuery,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });
  }

  function closeFind(): void {
    findOpen = false;
    findCurrent = 0;
    findTotal = 0;
    eventBus?.dispatch("findbarclose", {
      source: findController ?? viewerHost,
    });
  }

  function submitPassword(): void {
    const request = passwordRequest;
    if (!request || !passwordInput) return;
    passwordRequest = null;
    const password = passwordInput;
    passwordInput = "";
    request.update(password);
  }

  function cancelPassword(): void {
    const request = passwordRequest;
    passwordRequest = null;
    passwordInput = "";
    request?.cancel();
  }

  async function reveal(): Promise<void> {
    try {
      await file_reveal(path);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  async function openExternal(): Promise<void> {
    try {
      await file_open_external(path);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }

  function cleanup(): void {
    viewer?.cleanup();
    viewer?.setDocument(null as unknown as PDFDocumentProxy);
    findController?.setDocument(null as unknown as PDFDocumentProxy);
    void documentProxy?.cleanup();
    void loadingTask?.destroy();
    loadingTask = null;
    documentProxy = null;
    viewer = null;
    findController = null;
    eventBus = null;
  }

  onMount(() => {
    const vaultPath = vaultState.path;
    const url = vaultPath ? resolveVaultFile(vaultPath, path) : null;
    if (!url) {
      loading = false;
      failure = "The PDF path is invalid or outside the vault.";
      return;
    }

    const bus = new EventBus();
    const shortcut = (event: KeyboardEvent) => {
      if (
        shell.contains(event.target as Node) &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        findOpen = true;
      }
    };
    const externalLink = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      const href = anchor?.href;
      if (!href || !/^(?:https?|mailto):/i.test(href)) return;
      event.preventDefault();
      event.stopPropagation();
      void url_open_external(href).catch((error: unknown) =>
        showToast(errorMessage(error)),
      );
    };
    window.addEventListener("keydown", shortcut);
    container.addEventListener("click", externalLink, true);
    const linkService = new PDFLinkService({
      eventBus: bus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: "noopener noreferrer nofollow",
    });
    const search = new PDFFindController({
      eventBus: bus,
      linkService,
    });
    const nextViewer = new PdfJsViewer({
      container,
      viewer: viewerHost,
      eventBus: bus,
      linkService,
      findController: search,
      annotationMode: AnnotationMode.ENABLE,
      annotationEditorMode: 0,
      imageResourcesPath: `${pdfAssetBase}images/`,
      enableSelectionRendering: true,
      enableAutoLinking: false,
      removePageBorders: false,
    });
    linkService.setViewer(nextViewer);
    eventBus = bus;
    findController = search;
    viewer = nextViewer;

    bus.on("pagechanging", (value: unknown) => {
      if (!pageEvent(value)) return;
      currentPage = value.pageNumber;
      pageInput = String(value.pageNumber);
      onPosition?.(currentPage, nextViewer.currentScaleValue);
    });
    bus.on("scalechanging", (value: unknown) => {
      if (!scaleEvent(value)) return;
      scalePercent = Math.round(value.scale * 100);
      onPosition?.(nextViewer.currentPageNumber, nextViewer.currentScaleValue);
    });
    bus.on("updatefindmatchescount", (value: unknown) => {
      if (!matchesEvent(value)) return;
      findCurrent = value.matchesCount.current;
      findTotal = value.matchesCount.total;
    });
    bus.on("pagesinit", () => {
      nextViewer.currentScaleValue = initialScale;
      goToPage(initialPage);
    });

    const task = getDocument({
      url,
      cMapUrl: `${pdfAssetBase}cmaps/`,
      cMapPacked: true,
      iccUrl: `${pdfAssetBase}iccs/`,
      standardFontDataUrl: `${pdfAssetBase}standard_fonts/`,
      wasmUrl: `${pdfAssetBase}wasm/`,
      enableXfa: false,
      stopAtErrors: false,
    });
    loadingTask = task;
    task.onProgress = ({
      loaded,
      total,
    }: {
      loaded: number;
      total: number;
    }) => {
      loadProgress = total > 0 ? loaded / total : null;
    };
    task.onPassword = (
      updatePassword: (password: string) => void,
      reason: number,
    ) => {
      passwordRequest = {
        incorrect: reason !== PasswordResponses.NEED_PASSWORD,
        update: updatePassword,
        cancel: () => {
          failure = "A password is required to open this PDF.";
          loading = false;
          void task.destroy();
        },
      };
    };

    void task.promise
      .then((pdf) => {
        if (loadingTask !== task) {
          void pdf.cleanup();
          return;
        }
        documentProxy = pdf;
        pageCount = pdf.numPages;
        nextViewer.setDocument(pdf);
        linkService.setDocument(pdf);
        search.setDocument(pdf);
        loading = false;
      })
      .catch((error: unknown) => {
        if (loadingTask !== task) return;
        loading = false;
        failure = errorMessage(error);
      });

    return () => {
      window.removeEventListener("keydown", shortcut);
      container.removeEventListener("click", externalLink, true);
      cleanup();
    };
  });
</script>

<section
  bind:this={shell}
  class:compact
  class:find-open={findOpen}
  class="pdf-shell"
  style:height={height ? `${height}px` : undefined}
  aria-label={`PDF viewer for ${path}`}
>
  <div class="pdf-toolbar" role="toolbar" aria-label="PDF controls">
    <button
      type="button"
      title="Previous page"
      aria-label="Previous page"
      disabled={currentPage <= 1}
      onclick={() => goToPage(currentPage - 1)}>‹</button
    >
    <label class="page-control">
      <span class="sr-only">Page number</span>
      <input
        value={pageInput}
        inputmode="numeric"
        aria-label="Page number"
        oninput={(event) => (pageInput = event.currentTarget.value)}
        onblur={commitPage}
        onkeydown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitPage();
          }
        }}
      />
      <span>/ {pageCount || "–"}</span>
    </label>
    <button
      type="button"
      title="Next page"
      aria-label="Next page"
      disabled={!pageCount || currentPage >= pageCount}
      onclick={() => goToPage(currentPage + 1)}>›</button
    >
    <span class="toolbar-separator" aria-hidden="true"></span>
    <button
      type="button"
      title="Zoom out"
      aria-label="Zoom out"
      onclick={() => zoom(1 / 1.1)}>−</button
    >
    <button
      type="button"
      class="scale-button"
      title="Actual size"
      onclick={actualSize}>{scalePercent}%</button
    >
    <button
      type="button"
      title="Zoom in"
      aria-label="Zoom in"
      onclick={() => zoom(1.1)}>+</button
    >
    <button type="button" title="Fit width" onclick={fitWidth}>Fit</button>
    {#if !compact}
      <button type="button" title="Rotate clockwise" onclick={rotate}
        >Rotate</button
      >
      <button
        type="button"
        title="Find in PDF"
        aria-pressed={findOpen}
        onclick={() => (findOpen = !findOpen)}>Find</button
      >
      <span class="toolbar-spacer"></span>
      <button
        type="button"
        title="Open in default PDF app"
        onclick={openExternal}>Open externally</button
      >
      <button type="button" title="Reveal in file manager" onclick={reveal}
        >Reveal</button
      >
    {/if}
  </div>

  {#if findOpen}
    <div class="pdf-find" role="search">
      <input
        bind:value={findQuery}
        aria-label="Find in PDF"
        placeholder="Find in PDF"
        onkeydown={(event) => {
          if (event.key === "Enter") runFind(event.shiftKey);
          if (event.key === "Escape") closeFind();
        }}
      />
      <span>{findTotal ? `${findCurrent} of ${findTotal}` : "No matches"}</span>
      <button
        type="button"
        aria-label="Previous match"
        onclick={() => runFind(true)}>↑</button
      >
      <button
        type="button"
        aria-label="Next match"
        onclick={() => runFind(false)}>↓</button
      >
      <button type="button" aria-label="Close find" onclick={closeFind}
        >×</button
      >
    </div>
  {/if}

  <div bind:this={container} class="pdf-scroll">
    <div bind:this={viewerHost} class="pdfViewer"></div>
  </div>

  {#if loading}
    <div class="pdf-state" role="status">
      <span>Loading PDF…</span>
      {#if loadProgress !== null}
        <progress value={loadProgress} max="1"></progress>
      {/if}
    </div>
  {:else if failure}
    <div class="pdf-state pdf-error" role="alert">
      <strong>Could not open this PDF</strong>
      <span>{failure}</span>
      <button type="button" onclick={reveal}>Reveal file</button>
    </div>
  {/if}

  {#if passwordRequest}
    <div class="pdf-password-backdrop">
      <form
        class="pdf-password"
        aria-label="PDF password"
        onsubmit={(event) => {
          event.preventDefault();
          submitPassword();
        }}
      >
        <strong>Password required</strong>
        <p>
          {passwordRequest.incorrect
            ? "That password was incorrect. Try again."
            : "This PDF is password protected."}
        </p>
        <input
          bind:this={passwordElement}
          bind:value={passwordInput}
          type="password"
          aria-label="PDF password"
          autocomplete="off"
        />
        <div class="pdf-password-actions">
          <button type="button" onclick={cancelPassword}>Cancel</button>
          <button type="submit" disabled={!passwordInput}>Open PDF</button>
        </div>
      </form>
    </div>
  {/if}
</section>

<style>
  .pdf-shell {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    height: 100%;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    background: var(--background-primary);
  }

  .pdf-shell.compact {
    min-height: 240px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
  }

  .pdf-toolbar,
  .pdf-find {
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    min-height: 38px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border-color);
    background: var(--background-secondary);
  }

  .pdf-toolbar button,
  .pdf-find button {
    min-width: 30px;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    color: var(--text-normal);
    background: transparent;
  }

  .pdf-toolbar button:hover:not(:disabled),
  .pdf-find button:hover {
    background: var(--background-modifier-hover);
  }

  .pdf-toolbar button:disabled {
    opacity: 0.4;
  }

  .scale-button {
    min-width: 54px !important;
  }

  .page-control {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .page-control input {
    width: 42px;
    height: 26px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-normal);
    text-align: center;
    background: var(--background-primary);
  }

  .toolbar-separator {
    width: 1px;
    height: 20px;
    margin: 0 3px;
    background: var(--border-color);
  }

  .toolbar-spacer {
    flex: 1;
  }

  .pdf-find {
    justify-content: flex-end;
    min-height: 34px;
    padding-block: 3px;
  }

  .pdf-find input {
    width: min(260px, 45%);
    height: 26px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-normal);
    background: var(--background-primary);
  }

  .pdf-find span {
    min-width: 72px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .pdf-scroll {
    position: absolute;
    inset: 38px 0 0;
    overflow: auto;
    background: var(--background-secondary-alt, var(--background-secondary));
  }

  .pdf-shell.find-open .pdf-scroll {
    inset-block-start: 73px;
  }

  :global(.pdfViewer .page) {
    margin-block: 12px;
    border-color: var(--border-color) !important;
    box-shadow: var(--shadow-small);
  }

  :global(.pdfViewer .textLayer) {
    opacity: 1;
  }

  .pdf-state {
    position: absolute;
    z-index: 3;
    inset: 38px 0 0;
    display: grid;
    place-content: center;
    gap: 12px;
    padding: 24px;
    color: var(--text-muted);
    text-align: center;
    background: var(--background-primary);
  }

  .pdf-state progress {
    width: 220px;
  }

  .pdf-error strong {
    color: var(--text-normal);
  }

  .pdf-password-backdrop {
    position: absolute;
    z-index: 10;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: var(--color-overlay);
  }

  .pdf-password {
    display: grid;
    width: min(360px, 100%);
    gap: 12px;
    padding: 20px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-normal);
    background: var(--background-primary);
    box-shadow: var(--shadow-modal);
  }

  .pdf-password p {
    margin: 0;
    color: var(--text-muted);
  }

  .pdf-password input {
    height: 32px;
    box-sizing: border-box;
    border: 1px solid var(--border-color);
    border-radius: 5px;
    color: var(--text-normal);
    background: var(--background-secondary);
  }

  .pdf-password-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 700px) {
    .pdf-toolbar {
      overflow-x: auto;
    }

    .pdf-toolbar button {
      white-space: nowrap;
    }
  }
</style>
