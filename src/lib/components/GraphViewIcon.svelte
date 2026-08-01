<script lang="ts">
  let { name }: { name: "fit" | "zoom-in" | "zoom-out" } = $props();
</script>

<svg
  class="graph-view-icon"
  aria-hidden="true"
  viewBox="0 0 20 20"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "fit"}
    <path d="M7 3.25H3.25V7M13 3.25h3.75V7M7 16.75H3.25V13M13 16.75h3.75V13"
    ></path>
    <circle cx="10" cy="10" r="2.25"></circle>
  {:else}
    <circle cx="8.75" cy="8.75" r="5.25"></circle>
    <path d="m12.5 12.5 4.25 4.25M6.25 8.75h5"></path>
    {#if name === "zoom-in"}
      <path d="M8.75 6.25v5"></path>
    {/if}
  {/if}
</svg>
