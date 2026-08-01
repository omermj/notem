<script lang="ts" module>
  function autofocus(node: HTMLInputElement): void {
    requestAnimationFrame(() => node.focus());
  }
</script>

<script lang="ts">
  import { commands, type Command } from "../commands";
  import { fuzzyScore } from "../fuzzy";
  import { uiState } from "../stores/ui.svelte";

  let query = $state("");
  let selected = $state(0);
  const matches = $derived(
    commands
      .filter(
        (command) =>
          !command.hidden || query.trim().toLowerCase().startsWith("debug"),
      )
      .map((command) => ({
        command,
        score: fuzzyScore(query, `${command.name} ${command.id}`),
      }))
      .filter(
        (match): match is { command: Command; score: number } =>
          match.score !== null,
      )
      .sort((left, right) => left.score - right.score),
  );

  function close(): void {
    uiState.commandPaletteOpen = false;
    query = "";
    selected = 0;
  }

  function run(command: Command | undefined): void {
    if (!command) return;
    close();
    void Promise.resolve(command.run());
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      selected = Math.min(selected + 1, matches.length - 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selected = Math.max(selected - 1, 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(matches[selected]?.command);
    }
  }
</script>

{#if uiState.commandPaletteOpen}
  <div
    class="palette-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) close();
    }}
  >
    <div
      class="palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <input
        bind:value={query}
        oninput={() => (selected = 0)}
        onkeydown={keydown}
        use:autofocus
        placeholder="Type a command…"
        aria-label="Filter commands"
      />
      <div class="palette-results" role="listbox">
        {#each matches as match, index (match.command.id)}
          <button
            class:selected={index === selected}
            type="button"
            role="option"
            aria-selected={index === selected}
            onmouseenter={() => (selected = index)}
            onclick={() => run(match.command)}
          >
            <span>{match.command.name}</span>
            {#if match.command.hotkey}
              <kbd
                >{match.command.hotkey.replaceAll(
                  "Mod",
                  navigator.platform.includes("Mac") ? "⌘" : "Ctrl",
                )}</kbd
              >
            {/if}
          </button>
        {:else}
          <p class="palette-empty">No matching commands</p>
        {/each}
      </div>
    </div>
  </div>
{/if}
