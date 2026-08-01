<script lang="ts">
  import { onMount, tick } from "svelte";
  import ContextMenuIcon, {
    type ContextMenuIconName,
  } from "./ContextMenuIcon.svelte";

  export type ContextMenuItem =
    | { separator: true }
    | {
        label: string;
        icon: ContextMenuIconName;
        action: () => void;
        shortcut?: string;
        danger?: boolean;
      };

  let {
    x,
    y,
    items,
    label = "Context menu",
    onClose,
  }: {
    x: number;
    y: number;
    items: ContextMenuItem[];
    label?: string;
    onClose: () => void;
  } = $props();

  let menu: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);
  let positioned = $state(false);

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
  }

  function moveFocus(direction: 1 | -1): void {
    const entries = buttons();
    if (!entries.length) return;
    const current = entries.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      current < 0
        ? direction > 0
          ? 0
          : entries.length - 1
        : (current + direction + entries.length) % entries.length;
    entries[next].focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const entries = buttons();
      entries[event.key === "Home" ? 0 : entries.length - 1]?.focus();
    }
  }

  function run(action: () => void): void {
    onClose();
    action();
  }

  onMount(() => {
    let cancelled = false;

    void tick().then(() => {
      if (cancelled) return;
      const margin = 8;
      const rect = menu.getBoundingClientRect();
      left = Math.max(
        margin,
        Math.min(x, window.innerWidth - rect.width - margin),
      );
      top = Math.max(
        margin,
        Math.min(y, window.innerHeight - rect.height - margin),
      );
      positioned = true;
      buttons()[0]?.focus();
    });

    const closeOutside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) onClose();
    };
    const close = () => onClose();
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  });
</script>

<div
  bind:this={menu}
  class="context-menu"
  class:positioned
  role="menu"
  aria-label={label}
  tabindex="-1"
  style={`left: ${left}px; top: ${top}px`}
  onkeydown={handleKeydown}
>
  {#each items as item, index (`menu-item-${index}`)}
    {#if "separator" in item}
      <div class="menu-separator" role="separator"></div>
    {:else}
      <button
        class:danger={item.danger}
        type="button"
        role="menuitem"
        onclick={() => run(item.action)}
      >
        <ContextMenuIcon name={item.icon} />
        <span class="context-menu-label">{item.label}</span>
        {#if item.shortcut}
          <kbd>{item.shortcut}</kbd>
        {/if}
      </button>
    {/if}
  {/each}
</div>
