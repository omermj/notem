<script lang="ts">
  import { settingsState, updateSettings } from "../stores/settings.svelte";
</script>

<div class="setting-group">
  <h3>Interface</h3>
  <label class="setting-row">
    <span><strong>Theme</strong><small>Applied immediately</small></span>
    <select
      value={settingsState.theme}
      onchange={(event) =>
        updateSettings({
          theme: event.currentTarget.value as "light" | "dark" | "system",
        })}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>
  <div class="setting-row">
    <span
      ><strong>Accent color</strong><small
        >Used for links, focus, and actions</small
      ></span
    >
    <label class="color-setting-control">
      <input
        type="color"
        value={settingsState.accentColor}
        aria-label="Accent color"
        oninput={(event) =>
          updateSettings({ accentColor: event.currentTarget.value })}
      />
      <span>{settingsState.accentColor.toUpperCase()}</span>
    </label>
  </div>
</div>
