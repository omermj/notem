<script lang="ts">
  let {
    name,
  }: {
    name:
      | "general"
      | "editor"
      | "appearance"
      | "hotkeys"
      | "about"
      | "close"
      | "folder"
      | "reset";
  } = $props();
</script>

<svg
  aria-hidden="true"
  class="settings-icon"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === "general"}
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10"></path>
    <circle cx="16" cy="7" r="2"></circle>
    <circle cx="8" cy="17" r="2"></circle>
  {:else if name === "editor"}
    <path d="M4 20h4l11-11a2.83 2.83 0 0 0-4-4L4 16Z"></path>
    <path d="m13.5 6.5 4 4M4 16l4 4"></path>
  {:else if name === "appearance"}
    <path
      d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 .3-3.58A2 2 0 0 1 12 14h3a6 6 0 0 0 0-12Z"
    ></path>
    <circle cx="7.5" cy="10" r=".8"></circle>
    <circle cx="10" cy="6.5" r=".8"></circle>
    <circle cx="15" cy="6.5" r=".8"></circle>
  {:else if name === "hotkeys"}
    <rect x="3" y="5" width="18" height="14" rx="2"></rect>
    <path d="M7 9h.01M11 9h.01M15 9h.01M18 9h.01M7 13h.01M11 13h6M7 16h10"
    ></path>
  {:else if name === "about"}
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M12 11v5M12 8h.01"></path>
  {:else if name === "close"}
    <path d="M6 6l12 12M18 6 6 18"></path>
  {:else if name === "folder"}
    <path
      d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"
    ></path>
  {:else}
    <path d="M4 7v5h5M20 17v-5h-5"></path>
    <path d="M6.1 16A7 7 0 0 0 18 17l2-5M17.9 8A7 7 0 0 0 6 7l-2 5"></path>
  {/if}
</svg>
