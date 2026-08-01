<script lang="ts">
  import { runCommand } from "../commands";
  import { uiState } from "../stores/ui.svelte";
  import RibbonIcon from "./RibbonIcon.svelte";

  const actions = [
    {
      command: "sidebar.left.toggle",
      label: "Toggle left sidebar",
      icon: "panel-left",
    },
    {
      command: "sidebar.right.toggle",
      label: "Toggle right sidebar",
      icon: "panel-right",
    },
    { command: "switcher.open", label: "Quick switcher", icon: "search" },
    { command: "graph.open", label: "Graph view", icon: "graph" },
    { command: "daily.open", label: "Today's daily note", icon: "calendar" },
    { command: "palette.open", label: "Command palette", icon: "terminal" },
    { command: "settings.open", label: "Settings", icon: "settings" },
  ] as const;

  function isPressed(command: string): boolean | undefined {
    if (command === "sidebar.left.toggle") return uiState.leftSidebarOpen;
    if (command === "sidebar.right.toggle") return uiState.rightSidebarOpen;
    return undefined;
  }
</script>

<nav class="ribbon" aria-label="App shortcuts">
  <span class="ribbon-logo" aria-hidden="true">N</span>
  {#each actions as action, index (action.command)}
    {#if index === actions.length - 1}<span class="ribbon-spacer"></span>{/if}
    <button
      class:active={isPressed(action.command)}
      type="button"
      title={action.label}
      aria-label={action.label}
      aria-pressed={isPressed(action.command)}
      onclick={() => runCommand(action.command)}
      ><RibbonIcon name={action.icon} /></button
    >
  {/each}
</nav>
