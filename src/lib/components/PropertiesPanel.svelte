<script lang="ts">
  import {
    errorMessage,
    frontmatter_get,
    frontmatter_set,
    type PropertyEntry,
    type PropertyValueType,
  } from "../api";
  import { showToast } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import PropertyIcon from "./PropertyIcon.svelte";

  let { path }: { path: string } = $props();
  let collapsed = $state(false);
  let loading = $state(true);
  let saving = $state(false);
  let properties = $state<PropertyEntry[]>([]);
  let loadedPath = "";

  $effect(() => {
    if (loadedPath === path) return;
    loadedPath = path;
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      properties = await frontmatter_get(path);
    } catch (error) {
      showToast(errorMessage(error));
    } finally {
      loading = false;
    }
  }

  async function save(): Promise<void> {
    const file = vaultState.files[path];
    if (!file || saving) return;
    saving = true;
    try {
      await vaultState.save(path);
      const current = vaultState.files[path];
      const result = await frontmatter_set(
        path,
        $state.snapshot(properties),
        current.mtime,
      );
      vaultState.replaceContent(path, result.content, result.mtime);
    } catch (error) {
      showToast(errorMessage(error));
      await load();
    } finally {
      saving = false;
    }
  }

  function addProperty(): void {
    let number = 1;
    let key = "property";
    while (properties.some((property) => property.key === key)) {
      key = `property-${++number}`;
    }
    properties.push({ key, valueType: "text", value: "" });
    void save();
  }

  function removeProperty(index: number): void {
    properties.splice(index, 1);
    void save();
  }

  function setType(property: PropertyEntry, type: PropertyValueType): void {
    property.valueType = type;
    property.value =
      type === "checkbox"
        ? false
        : type === "number"
          ? 0
          : type === "list"
            ? []
            : "";
    void save();
  }

  function listText(property: PropertyEntry): string {
    return Array.isArray(property.value) ? property.value.join(", ") : "";
  }

  function setList(property: PropertyEntry, value: string): void {
    property.value = value
      .split(",")
      .map((item) => item.trim().replace(/^#/, ""))
      .filter(Boolean);
    void save();
  }

  function addTag(property: PropertyEntry, input: HTMLInputElement): void {
    const tag = input.value.trim().replace(/^#/, "");
    if (!tag) return;
    const tags = Array.isArray(property.value) ? property.value : [];
    if (!tags.includes(tag)) property.value = [...tags, tag];
    input.value = "";
    void save();
  }
</script>

<section class="properties-panel" class:collapsed aria-label="Properties">
  <button
    class="properties-heading"
    type="button"
    onclick={() => (collapsed = !collapsed)}
    aria-expanded={!collapsed}
  >
    <span class="property-chevron" aria-hidden="true">
      <PropertyIcon name="chevron" />
    </span>
    <strong>Properties</strong>
    {#if saving}
      <small class="properties-saving">Saving…</small>
    {:else}
      <small
        class="properties-count"
        aria-label={`${properties.length} ${properties.length === 1 ? "property" : "properties"}`}
        >{properties.length}</small
      >
    {/if}
  </button>
  {#if !collapsed}
    <div class="properties-body">
      {#if loading}
        <p class="properties-empty">Loading properties…</p>
      {:else}
        {#each properties as property, index (`${index}-${property.key}`)}
          <div class="property-row">
            <input
              class="property-key"
              aria-label="Property name"
              bind:value={property.key}
              onchange={() => {
                if (property.key === "tags" && property.valueType !== "list") {
                  property.valueType = "list";
                  property.value = String(property.value)
                    .split(/[,\s]+/)
                    .filter(Boolean);
                }
                void save();
              }}
            />
            <div class="property-value">
              {#if property.key === "tags" && property.valueType === "list"}
                <div class="tag-pill-editor">
                  {#each Array.isArray(property.value) ? property.value : [] as tag (tag)}
                    <button
                      type="button"
                      title={`Remove ${tag}`}
                      onclick={() => {
                        property.value = (property.value as string[]).filter(
                          (value) => value !== tag,
                        );
                        void save();
                      }}>#{tag} ×</button
                    >
                  {/each}
                  <input
                    aria-label="Add tag"
                    placeholder="Add tag"
                    onkeydown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addTag(property, event.currentTarget);
                      }
                    }}
                    onblur={(event) => addTag(property, event.currentTarget)}
                  />
                </div>
              {:else if property.valueType === "checkbox"}
                <input
                  type="checkbox"
                  aria-label={property.key}
                  checked={Boolean(property.value)}
                  onchange={(event) => {
                    property.value = event.currentTarget.checked;
                    void save();
                  }}
                />
              {:else if property.valueType === "number"}
                <input
                  type="number"
                  aria-label={property.key}
                  value={Number(property.value)}
                  onchange={(event) => {
                    property.value = event.currentTarget.valueAsNumber;
                    void save();
                  }}
                />
              {:else if property.valueType === "date"}
                <input
                  type="date"
                  aria-label={property.key}
                  value={String(property.value)}
                  onchange={(event) => {
                    property.value = event.currentTarget.value;
                    void save();
                  }}
                />
              {:else if property.valueType === "list"}
                <input
                  aria-label={property.key}
                  value={listText(property)}
                  placeholder="Comma-separated values"
                  onchange={(event) =>
                    setList(property, event.currentTarget.value)}
                />
              {:else}
                <input
                  aria-label={property.key}
                  value={String(property.value)}
                  onchange={(event) => {
                    property.value = event.currentTarget.value;
                    void save();
                  }}
                />
              {/if}
            </div>
            <select
              class="property-type"
              aria-label={`Type for ${property.key}`}
              value={property.valueType}
              onchange={(event) =>
                setType(
                  property,
                  event.currentTarget.value as PropertyValueType,
                )}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="checkbox">Checkbox</option>
              <option value="date">Date</option>
              <option value="list">List</option>
            </select>
            <button
              class="property-remove"
              type="button"
              aria-label={`Remove ${property.key}`}
              title={`Remove ${property.key}`}
              onclick={() => removeProperty(index)}
            >
              <PropertyIcon name="remove" />
            </button>
          </div>
        {/each}
        <button class="property-add" type="button" onclick={addProperty}>
          <PropertyIcon name="add" />
          <span>Add property</span>
        </button>
      {/if}
    </div>
  {/if}
</section>
