<script lang="ts">
  let { name }: { name: "edit" | "read" } = $props();
</script>

<svg
  aria-hidden="true"
  class="view-mode-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "edit"}
    <path d="M4 20h4l11-11a2.83 2.83 0 0 0-4-4L4 16Z"></path>
    <path d="m13.5 6.5 4 4M4 16l4 4"></path>
  {:else}
    <path d="M4 5.5A3.5 3.5 0 0 1 7.5 9H11v10H7.5A3.5 3.5 0 0 0 4 22Z"></path>
    <path d="M20 5.5A3.5 3.5 0 0 0 16.5 9H13v10h3.5A3.5 3.5 0 0 1 20 22Z"
    ></path>
  {/if}
</svg>
