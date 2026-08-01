<script lang="ts">
  let {
    name,
    expanded = false,
  }: {
    name: "chevron" | "folder" | "file";
    expanded?: boolean;
  } = $props();
</script>

<svg
  aria-hidden="true"
  class:file-tree-chevron={name === "chevron"}
  class:file-tree-glyph={name !== "chevron"}
  class:expanded
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "chevron"}
    <path d="m9 6 6 6-6 6"></path>
  {:else if name === "folder" && expanded}
    <path
      d="M3.5 8.5V6.75A1.75 1.75 0 0 1 5.25 5h4.1l2.1 2h7.3a1.75 1.75 0 0 1 1.75 1.75v1"
    ></path>
    <path
      d="M4.25 10h16.5a1.25 1.25 0 0 1 1.2 1.6l-2.1 7.15A1.75 1.75 0 0 1 18.17 20H5.83a1.75 1.75 0 0 1-1.68-1.25L2.8 14.15A3.25 3.25 0 0 1 4.25 10Z"
    ></path>
  {:else if name === "folder"}
    <path
      d="M3 7.25A2.25 2.25 0 0 1 5.25 5h4.1l2.1 2h7.3A2.25 2.25 0 0 1 21 9.25v8.5A2.25 2.25 0 0 1 18.75 20H5.25A2.25 2.25 0 0 1 3 17.75Z"
    ></path>
  {:else}
    <path d="M6 3h7l5 5v13H6Z"></path>
    <path d="M13 3v5h5M9 13h6M9 17h4"></path>
  {/if}
</svg>
