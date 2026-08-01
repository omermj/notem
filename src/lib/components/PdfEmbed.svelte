<script lang="ts">
  import { onMount } from "svelte";
  import { attachment_resolve, errorMessage } from "../api";
  import { parsePdfTarget } from "../pdf/targets";
  import { showToast } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import LazyPdfViewer from "./LazyPdfViewer.svelte";

  let {
    sourcePath,
    target,
  }: {
    sourcePath: string;
    target: string;
  } = $props();

  const parsed = $derived(parsePdfTarget(target));
  let resolvedPath = $state<string | null>(null);
  let resolutionError = $state<string | null>(null);

  onMount(() => {
    if (!parsed) {
      resolutionError = "Invalid PDF embed.";
      return;
    }
    let active = true;
    void attachment_resolve(sourcePath, parsed.source)
      .then(async (resolution) => {
        if (!active) return;
        if (resolution.status === "resolved" && resolution.path) {
          await vaultState.loadFile(resolution.path);
          if (!active) return;
          resolvedPath = resolution.path;
        } else {
          resolutionError =
            resolution.status === "ambiguous"
              ? `More than one file matches “${parsed.source}”.`
              : `PDF not found: ${parsed.source}`;
        }
      })
      .catch((error: unknown) => {
        if (active) resolutionError = errorMessage(error);
      });
    return () => {
      active = false;
    };
  });

  async function openInTab(): Promise<void> {
    if (!resolvedPath) return;
    try {
      await vaultState.openPdf(resolvedPath, parsed?.page ?? 1, true);
    } catch (error) {
      showToast(errorMessage(error));
    }
  }
</script>

<div class="pdf-embed">
  {#if resolvedPath && parsed}
    {#key `${resolvedPath}:${vaultState.files[resolvedPath]?.mtime ?? 0}`}
      <LazyPdfViewer
        path={resolvedPath}
        initialPage={parsed.page}
        height={parsed.height ?? 500}
        compact
      />
    {/key}
    <button
      class="pdf-embed-open"
      type="button"
      title="Open PDF in tab"
      aria-label="Open PDF in tab"
      onclick={openInTab}>↗</button
    >
  {:else if resolutionError}
    <div class="pdf-embed-error" role="alert">{resolutionError}</div>
  {:else}
    <div class="pdf-embed-loading" role="status">Resolving PDF…</div>
  {/if}
</div>

<style>
  .pdf-embed {
    position: relative;
    display: block;
    margin-block: 1em;
  }

  .pdf-embed-open {
    position: absolute;
    z-index: 5;
    inset-block-start: 5px;
    inset-inline-end: 6px;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 4px;
    color: var(--text-muted);
    background: var(--background-secondary);
  }

  .pdf-embed-open:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .pdf-embed-error,
  .pdf-embed-loading {
    display: grid;
    min-height: 120px;
    place-items: center;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-muted);
    background: var(--background-secondary);
  }

  .pdf-embed-error {
    color: var(--color-danger);
  }
</style>
