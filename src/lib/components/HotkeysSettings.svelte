<script lang="ts">
  import { commands } from "../commands";
  import {
    resetHotkey,
    setHotkey,
    settingsState,
  } from "../stores/settings.svelte";
  import { showToast } from "../stores/ui.svelte";
  import SettingsIcon from "./SettingsIcon.svelte";

  let recording = $state<string | null>(null);

  function eventHotkey(event: KeyboardEvent): string | null {
    if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return null;
    const parts: string[] = [];
    if (event.metaKey || event.ctrlKey) parts.push("Mod");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    const key =
      event.code === "Backslash"
        ? "\\"
        : event.key.length === 1
          ? event.key.toUpperCase()
          : event.key;
    parts.push(key);
    return parts.join("+");
  }

  async function capture(
    event: KeyboardEvent,
    commandId: string,
  ): Promise<void> {
    if (recording !== commandId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      recording = null;
      return;
    }
    const hotkey = eventHotkey(event);
    if (!hotkey) return;
    const duplicate = commands.find(
      (command) =>
        command.id !== commandId &&
        (settingsState.hotkeys[command.id] ?? command.defaultHotkey) === hotkey,
    );
    if (duplicate) {
      showToast(`${hotkey} is already assigned to ${duplicate.name}`);
      return;
    }
    await setHotkey(commandId, hotkey);
    recording = null;
  }

  function displayedHotkey(commandId: string): string {
    const command = commands.find((candidate) => candidate.id === commandId);
    return (
      settingsState.hotkeys[commandId] ?? command?.defaultHotkey ?? "Unassigned"
    );
  }
</script>

<p class="settings-help">
  Select a shortcut, then press the new key combination.
</p>
<div class="hotkey-list">
  {#each commands as command (command.id)}
    <div class="hotkey-row">
      <span>{command.name}</span>
      <button
        class="hotkey-binding"
        class:recording={recording === command.id}
        type="button"
        onkeydown={(event) => capture(event, command.id)}
        onclick={() => (recording = command.id)}
      >
        {#if recording === command.id}
          <span>Press keys…</span>
        {:else}
          <kbd>{displayedHotkey(command.id)}</kbd>
        {/if}
      </button>
      <button
        class="hotkey-reset"
        type="button"
        aria-label={`Reset ${command.name} shortcut`}
        title="Reset shortcut"
        disabled={!settingsState.hotkeys[command.id]}
        onclick={() => resetHotkey(command.id)}
      >
        <SettingsIcon name="reset" />
      </button>
    </div>
  {/each}
</div>
