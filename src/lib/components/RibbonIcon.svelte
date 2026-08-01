<script lang="ts">
  let {
    name,
  }: {
    name:
      | "search"
      | "graph"
      | "calendar"
      | "terminal"
      | "settings"
      | "panel-left"
      | "panel-right";
  } = $props();
</script>

<svg
  aria-hidden="true"
  class="ribbon-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width="2"
>
  {#if name === "search"}
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-4-4"></path>
  {:else if name === "graph"}
    <circle cx="6" cy="6" r="2.5"></circle>
    <circle cx="18" cy="7" r="2.5"></circle>
    <circle cx="12" cy="18" r="2.5"></circle>
    <path d="m8.3 6.4 7.2.4M7.4 8.1l3.4 7.7m5.7-6.7-3.2 6.7"></path>
  {:else if name === "calendar"}
    <rect x="3" y="5" width="18" height="16" rx="2"></rect>
    <path d="M16 3v4M8 3v4M3 10h18"></path>
    <path d="m9 16 2 2 4-4"></path>
  {:else if name === "terminal"}
    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
    <path d="m7 9 3 3-3 3m6 0h4"></path>
  {:else if name === "panel-left"}
    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
    <path d="M9 4v16"></path>
  {:else if name === "panel-right"}
    <rect x="3" y="4" width="18" height="16" rx="2"></rect>
    <path d="M15 4v16"></path>
  {:else}
    <circle cx="12" cy="12" r="3"></circle>
    <path
      d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"
    ></path>
  {/if}
</svg>
