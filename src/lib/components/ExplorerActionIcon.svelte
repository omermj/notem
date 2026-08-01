<script lang="ts">
  let { name }: { name: "note" | "folder" } = $props();
</script>

<svg
  aria-hidden="true"
  class="explorer-action-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "note"}
    <path d="M5 3.5h8l4 4V20.5H5Z"></path>
    <path d="M13 3.5v4h4M8 13h6M11 10v6"></path>
  {:else}
    <path
      d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z"
    ></path>
    <path d="M15 11v6M12 14h6"></path>
  {/if}
</svg>
