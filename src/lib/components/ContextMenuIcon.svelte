<script lang="ts">
  export type ContextMenuIconName =
    | "close"
    | "folder"
    | "copy"
    | "move"
    | "note"
    | "rename"
    | "reveal"
    | "split-down"
    | "split-right"
    | "trash";

  let { name }: { name: ContextMenuIconName } = $props();
</script>

<svg
  class="context-menu-icon"
  aria-hidden="true"
  viewBox="0 0 20 20"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "note"}
    <path d="M4.5 2.75h6l3 3v11.5h-9Z"></path>
    <path d="M10.5 2.75v3h3M7 11h4.5M9.25 8.75v4.5"></path>
  {:else if name === "folder"}
    <path
      d="M2.75 6.5A1.75 1.75 0 0 1 4.5 4.75H8l1.6 1.75h5.9a1.75 1.75 0 0 1 1.75 1.75v6.5a1.75 1.75 0 0 1-1.75 1.75h-11a1.75 1.75 0 0 1-1.75-1.75Z"
    ></path>
    <path d="M12.5 9.5v4M10.5 11.5h4"></path>
  {:else if name === "rename"}
    <path
      d="m4 14.75.5-3 7.8-7.8a1.4 1.4 0 0 1 2 0l.75.75a1.4 1.4 0 0 1 0 2l-7.8 7.8Z"
    ></path>
    <path d="m11.25 5 3.75 3.75M3.75 17h12.5"></path>
  {:else if name === "move"}
    <path
      d="M2.75 6.25A1.75 1.75 0 0 1 4.5 4.5H8l1.6 1.75h5.9A1.75 1.75 0 0 1 17.25 8v6.75a1.75 1.75 0 0 1-1.75 1.75h-11a1.75 1.75 0 0 1-1.75-1.75Z"
    ></path>
    <path d="M7 11.5h6M10.75 9.25 13 11.5l-2.25 2.25"></path>
  {:else if name === "copy"}
    <rect x="6.25" y="6.25" width="10.5" height="10.5" rx="1.5"></rect>
    <path
      d="M13.75 6.25v-1A2 2 0 0 0 11.75 3h-6.5a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h1"
    ></path>
  {:else if name === "reveal"}
    <path d="M7.5 4.25H4.75a2 2 0 0 0-2 2v9h9a2 2 0 0 0 2-2V10.5"></path>
    <path d="M9.25 2.75h8v8M17.25 2.75l-8.5 8.5"></path>
  {:else if name === "trash"}
    <path d="M3.25 5.25h13.5M7.25 5.25v-2h5.5v2M5.25 5.25l.75 12h8l.75-12"
    ></path>
    <path d="M8 8.25v5.75M12 8.25v5.75"></path>
  {:else if name === "split-right"}
    <rect x="2.75" y="3.25" width="14.5" height="13.5" rx="1.5"></rect>
    <path d="M10 3.25v13.5M12.5 10h2.5M13.75 8.75v2.5"></path>
  {:else if name === "split-down"}
    <rect x="2.75" y="3.25" width="14.5" height="13.5" rx="1.5"></rect>
    <path d="M2.75 10h14.5M8.75 13.25h2.5M10 12v2.5"></path>
  {:else}
    <path d="M5 5l10 10M15 5 5 15"></path>
  {/if}
</svg>
