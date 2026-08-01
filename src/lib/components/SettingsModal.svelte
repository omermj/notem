<script lang="ts">
  import { runCommand } from "../commands";
  import { EDITOR_FONTS, type EditorFont } from "../editor/fonts";
  import HotkeysSettings from "./HotkeysSettings.svelte";
  import AppearanceSettings from "./AppearanceSettings.svelte";
  import SettingsIcon from "./SettingsIcon.svelte";
  import SettingToggle from "./SettingToggle.svelte";
  import { noteTitle, templatePaths } from "../productivity";
  import {
    settingsState,
    updateEditorSettings,
    updateSettings,
  } from "../stores/settings.svelte";
  import { uiState } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import projectLicense from "../../../LICENSE?raw";
  import thirdPartyNotices from "../../../THIRD_PARTY_NOTICES.md?raw";

  type Section = "general" | "editor" | "appearance" | "hotkeys" | "about";
  let section = $state<Section>("general");
  const sections: { id: Section; label: string }[] = [
    { id: "general", label: "General" },
    { id: "editor", label: "Editor" },
    { id: "appearance", label: "Appearance" },
    { id: "hotkeys", label: "Hotkeys" },
    { id: "about", label: "About" },
  ];
  const templates = $derived(
    templatePaths(vaultState.tree, settingsState.templatesFolder),
  );

  function close(): void {
    uiState.settingsOpen = false;
  }
</script>

{#if uiState.settingsOpen}
  <div
    class="modal-backdrop"
    role="presentation"
    onkeydown={(event) => {
      if (event.key === "Escape") close();
    }}
    onclick={(event) => {
      if (event.target === event.currentTarget) close();
    }}
  >
    <div
      class="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <aside class="settings-nav">
        <strong>Settings</strong>
        {#each sections as item (item.id)}
          <button
            class:active={section === item.id}
            type="button"
            onclick={() => (section = item.id)}
          >
            <SettingsIcon name={item.id} />
            <span>{item.label}</span>
          </button>
        {/each}
      </aside>
      <section class="settings-content">
        <header>
          <h2>{section[0].toUpperCase() + section.slice(1)}</h2>
          <button
            class="settings-close"
            type="button"
            onclick={close}
            aria-label="Close settings"
            title="Close settings"
          >
            <SettingsIcon name="close" />
          </button>
        </header>

        {#if section === "general"}
          <div class="setting-group">
            <h3>Vault</h3>
            <div class="setting-row">
              <div>
                <strong>Current vault</strong><small
                  >{vaultState.path ?? "No vault open"}</small
                >
              </div>
              <button
                class="setting-action"
                type="button"
                onclick={() => runCommand("vault.open")}
              >
                <SettingsIcon name="folder" />
                <span>Open vault</span>
              </button>
            </div>
          </div>
          <div class="setting-group">
            <h3>Daily notes</h3>
            <label class="setting-row">
              <span
                ><strong>Folder</strong><small>Vault-relative path</small></span
              >
              <input
                value={settingsState.dailyNotesFolder}
                onchange={(event) =>
                  updateSettings({
                    dailyNotesFolder: event.currentTarget.value,
                  })}
              />
            </label>
            <label class="setting-row">
              <span
                ><strong>Date format</strong><small
                  >YYYY, MM, and DD are supported</small
                ></span
              >
              <input
                value={settingsState.dailyNoteDateFormat}
                onchange={(event) =>
                  updateSettings({
                    dailyNoteDateFormat: event.currentTarget.value,
                  })}
              />
            </label>
            <label class="setting-row">
              <span
                ><strong>Daily template</strong><small
                  >Optional template for new daily notes</small
                ></span
              >
              <select
                value={settingsState.dailyNoteTemplate ?? ""}
                onchange={(event) =>
                  updateSettings({
                    dailyNoteTemplate: event.currentTarget.value || null,
                  })}
              >
                <option value="">None</option>
                {#each templates as path (path)}
                  <option value={path}>{noteTitle(path)}</option>
                {/each}
              </select>
            </label>
          </div>
          <div class="setting-group">
            <h3>Templates</h3>
            <label class="setting-row">
              <span
                ><strong>Templates folder</strong><small
                  >Markdown files below this folder appear in template pickers</small
                ></span
              >
              <input
                value={settingsState.templatesFolder}
                onchange={(event) =>
                  updateSettings({
                    templatesFolder: event.currentTarget.value,
                  })}
              />
            </label>
          </div>
        {:else if section === "editor"}
          <div class="setting-group">
            <h3>Writing</h3>
            <label class="setting-row">
              <span
                ><strong>Note width</strong><small
                  >Applied to both Edit and Read modes</small
                ></span
              >
              <select
                value={settingsState.readableLineLength ? "centered" : "wide"}
                onchange={(event) =>
                  updateSettings({
                    readableLineLength:
                      event.currentTarget.value === "centered",
                  })}
              >
                <option value="centered">Centered</option>
                <option value="wide">Wide</option>
              </select>
            </label>
            <label class="setting-row">
              <span
                ><strong>Editor font</strong><small
                  >Named fonts use the default when not installed</small
                ></span
              >
              <select
                value={settingsState.editorFont}
                onchange={(event) =>
                  updateSettings({
                    editorFont: event.currentTarget.value as EditorFont,
                  })}
              >
                {#each EDITOR_FONTS as font (font.id)}
                  <option value={font.id}>{font.label}</option>
                {/each}
              </select>
            </label>
            <label class="setting-row">
              <span><strong>Font size</strong><small>10–32 pixels</small></span>
              <input
                type="number"
                min="10"
                max="32"
                value={settingsState.editorFontSize}
                onchange={(event) =>
                  updateEditorSettings(
                    event.currentTarget.valueAsNumber,
                    settingsState.editorLineWidth,
                    settingsState.spellcheck,
                  )}
              />
            </label>
            <label class="setting-row">
              <span
                ><strong>Line width</strong><small
                  >Centered mode, 40–160 characters</small
                ></span
              >
              <input
                type="number"
                min="40"
                max="160"
                value={settingsState.editorLineWidth}
                onchange={(event) =>
                  updateEditorSettings(
                    settingsState.editorFontSize,
                    event.currentTarget.valueAsNumber,
                    settingsState.spellcheck,
                  )}
              />
            </label>
            <div class="setting-row">
              <span
                ><strong>Spellcheck</strong><small
                  >Underline misspellings using the local English dictionary</small
                ></span
              >
              <SettingToggle
                label="Spellcheck"
                checked={settingsState.spellcheck}
                onchange={(checked) =>
                  updateEditorSettings(
                    settingsState.editorFontSize,
                    settingsState.editorLineWidth,
                    checked,
                  )}
              />
            </div>
            <div class="setting-row">
              <span
                ><strong>Highlight active line</strong><small
                  >Tint the line containing the text cursor</small
                ></span
              >
              <SettingToggle
                label="Highlight active line"
                checked={settingsState.highlightActiveLine}
                onchange={(checked) =>
                  updateSettings({
                    highlightActiveLine: checked,
                  })}
              />
            </div>
          </div>
        {:else if section === "appearance"}
          <AppearanceSettings />
        {:else if section === "hotkeys"}
          <HotkeysSettings />
        {:else}
          <div class="about-panel">
            <span class="welcome-icon" aria-hidden="true">N</span>
            <h3>NoteM 0.2.0</h3>
            <p>A lightweight, local-first Markdown knowledge base.</p>
            <p>
              Your notes stay as plain files. No cloud, account, or telemetry.
            </p>
            <p>Open-source software licensed under the MIT License.</p>
            <div class="legal-documents">
              <details>
                <summary>MIT License</summary>
                <pre>{projectLicense}</pre>
              </details>
              <details>
                <summary>Third-party notices</summary>
                <pre>{thirdPartyNotices}</pre>
              </details>
            </div>
          </div>
        {/if}
      </section>
    </div>
  </div>
{/if}
