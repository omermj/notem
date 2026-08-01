<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { errorMessage } from "../api";

  type ViewerProps = {
    path: string;
    initialPage?: number;
    initialScale?: string;
    compact?: boolean;
    height?: number;
    onPosition?: (page: number, scale: string) => void;
  };

  let {
    path,
    initialPage = 1,
    initialScale = "page-width",
    compact = false,
    height,
    onPosition,
  }: ViewerProps = $props();

  let Viewer = $state<Component<ViewerProps> | null>(null);
  let failure = $state<string | null>(null);

  onMount(() => {
    let active = true;
    void import("./PdfViewer.svelte")
      .then((module) => {
        if (active) Viewer = module.default;
      })
      .catch((error: unknown) => {
        if (active) failure = errorMessage(error);
      });
    return () => {
      active = false;
    };
  });
</script>

{#if Viewer}
  <Viewer {path} {initialPage} {initialScale} {compact} {height} {onPosition} />
{:else if failure}
  <div class="pdf-lazy-state" role="alert">
    Could not load PDF viewer: {failure}
  </div>
{:else}
  <div class="pdf-lazy-state" role="status">Loading PDF viewer…</div>
{/if}

<style>
  .pdf-lazy-state {
    display: grid;
    min-height: 160px;
    height: 100%;
    flex: 1;
    place-items: center;
    padding: 24px;
    color: var(--text-muted);
    background: var(--background-primary);
  }
</style>
