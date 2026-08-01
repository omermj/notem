<script lang="ts">
  let { name }: { name: "chevron" | "add" | "remove" } = $props();
</script>

<svg
  aria-hidden="true"
  class="property-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "chevron"}
    <path d="m7 9 5 5 5-5"></path>
  {:else if name === "add"}
    <path d="M12 5v14M5 12h14"></path>
  {:else}
    <path d="M6 6l12 12M18 6 6 18"></path>
  {/if}
</svg>
