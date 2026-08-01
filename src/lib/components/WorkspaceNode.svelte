<script lang="ts">
  import PaneView from "./PaneView.svelte";
  import WorkspaceNode from "./WorkspaceNode.svelte";
  import {
    resizeWorkspaceSplit,
    type WorkspaceNode as WorkspaceNodeType,
  } from "../stores/ui.svelte";

  let { node }: { node: WorkspaceNodeType } = $props();

  function beginResize(event: PointerEvent): void {
    if (node.kind !== "split") return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLElement;
    const container = divider.parentElement;
    if (!container) return;
    const dividerBounds = divider.getBoundingClientRect();
    const grabOffset =
      node.direction === "horizontal"
        ? event.clientX - dividerBounds.left
        : event.clientY - dividerBounds.top;
    const dividerSize =
      node.direction === "horizontal"
        ? dividerBounds.width
        : dividerBounds.height;
    const move = (next: PointerEvent): void => {
      const bounds = container.getBoundingClientRect();
      const availableSize =
        (node.direction === "horizontal" ? bounds.width : bounds.height) -
        dividerSize;
      if (availableSize <= 0) return;
      const ratio =
        node.direction === "horizontal"
          ? (next.clientX - bounds.left - grabOffset) / availableSize
          : (next.clientY - bounds.top - grabOffset) / availableSize;
      resizeWorkspaceSplit(node.id, ratio);
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing-workspace");
    };
    document.body.classList.add("resizing-workspace");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }
</script>

{#if node.kind === "pane"}
  <PaneView pane={node} />
{:else}
  <div
    class:split-horizontal={node.direction === "horizontal"}
    class:split-vertical={node.direction === "vertical"}
    class="workspace-split"
  >
    <div class="workspace-split-child" style:flex-grow={node.ratio}>
      <WorkspaceNode node={node.children[0]} />
    </div>
    <div
      class:horizontal={node.direction === "horizontal"}
      class:vertical={node.direction === "vertical"}
      class="workspace-divider"
      role="separator"
      aria-label="Resize split"
      aria-orientation={node.direction === "horizontal"
        ? "vertical"
        : "horizontal"}
      onpointerdown={beginResize}
    ></div>
    <div class="workspace-split-child" style:flex-grow={1 - node.ratio}>
      <WorkspaceNode node={node.children[1]} />
    </div>
  </div>
{/if}
