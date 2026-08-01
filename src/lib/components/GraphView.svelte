<script lang="ts">
  import { errorMessage, type GraphNode } from "../api";
  import {
    filterGraph,
    graphState,
    neighborhood,
  } from "../stores/graph.svelte";
  import { showToast, uiState } from "../stores/ui.svelte";
  import { vaultState } from "../stores/vault.svelte";
  import GraphCanvas from "./GraphCanvas.svelte";
  import type { GraphViewCommand } from "./GraphCanvas.svelte";
  import GraphViewIcon from "./GraphViewIcon.svelte";
  import type { NoteDrag } from "../drag";
  import { beginInternalDrag } from "../internalDrag";

  let {
    scope = "global",
    activeId = null,
  }: {
    scope?: "global" | "local";
    activeId?: string | null;
  } = $props();

  let query = $state("");
  let showGhosts = $state(true);
  let strength = $state(55);
  let linkDistance = $state(42);
  let depth = $state<1 | 2>(1);
  let hovered = $state<GraphNode | null>(null);
  let viewCommand = $state<GraphViewCommand | null>(null);
  let nextViewCommandId = 1;

  const scopedGraph = $derived(
    scope === "local"
      ? neighborhood(graphState.data, activeId, depth)
      : graphState.data,
  );
  const visibleGraph = $derived(filterGraph(scopedGraph, query, showGhosts));
  const forces = $derived({ strength, linkDistance });
  const centerId = $derived(scope === "local" ? activeId : null);

  $effect(() => {
    const revision = uiState.indexRevision;
    if (vaultState.path) void graphState.load(revision, vaultState.path);
  });

  async function openNode(node: GraphNode): Promise<void> {
    try {
      const newTab = scope === "global";
      if (node.ghost) {
        await vaultState.openWikilink(node.id, newTab, activeId ?? undefined);
      } else {
        await vaultState.openFile(`${node.id}.md`, newTab);
      }
    } catch (error) {
      showToast(`Could not open ${node.title}: ${errorMessage(error)}`);
    }
  }

  function requestViewAction(action: GraphViewCommand["action"]): void {
    viewCommand = { id: nextViewCommandId++, action };
  }
</script>

<section
  class:local-graph={scope === "local"}
  class="graph-view"
  aria-label={scope === "local" ? "Local graph" : "Global graph"}
>
  {#if graphState.error}
    <div class="graph-state">
      <p>{graphState.error}</p>
      <button
        type="button"
        onclick={() =>
          vaultState.path &&
          graphState.load(uiState.indexRevision, vaultState.path)}
      >
        Retry
      </button>
    </div>
  {:else if graphState.loading && graphState.data.nodes.length === 0}
    <p class="graph-state">Loading graph…</p>
  {:else if scope === "local" && !activeId}
    <p class="graph-state">Open a note to see its neighborhood.</p>
  {:else}
    <GraphCanvas
      graph={visibleGraph}
      {forces}
      {centerId}
      {viewCommand}
      compact={scope === "local"}
      onopen={openNode}
      onhover={(node) => (hovered = node)}
    />
    <div class="graph-viewport-controls" aria-label="Graph zoom controls">
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        onclick={() => requestViewAction("zoom-in")}
      >
        <GraphViewIcon name="zoom-in" />
      </button>
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        onclick={() => requestViewAction("zoom-out")}
      >
        <GraphViewIcon name="zoom-out" />
      </button>
      <button
        type="button"
        title="Fit graph to view"
        aria-label="Fit graph to view"
        onclick={() => requestViewAction("fit")}
      >
        <GraphViewIcon name="fit" />
      </button>
    </div>
    <div class="graph-controls">
      <label class="graph-search">
        <span class="visually-hidden">Filter graph nodes</span>
        <input bind:value={query} type="search" placeholder="Filter nodes…" />
      </label>
      <label class="graph-check">
        <input bind:checked={showGhosts} type="checkbox" />
        Unresolved
      </label>
      {#if scope === "local"}
        <label>
          Depth
          <select bind:value={depth}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
      {/if}
      <label>
        Force
        <input bind:value={strength} type="range" min="10" max="180" step="5" />
      </label>
      <label>
        Distance
        <input
          bind:value={linkDistance}
          type="range"
          min="18"
          max="120"
          step="2"
        />
      </label>
    </div>
    <div
      class="graph-caption"
      role="button"
      tabindex="-1"
      title={hovered && !hovered.ghost
        ? "Drag this note to a tab bar, pane, or editor"
        : undefined}
      onpointerdown={(event) => {
        if (!hovered || hovered.ghost) return;
        const payload: NoteDrag = {
          kind: "note",
          path: `${hovered.id}.md`,
        };
        beginInternalDrag(event, payload, { label: hovered.title });
      }}
    >
      {#if hovered}
        <strong>{hovered.title}</strong>
        <span
          >{hovered.linksCount} links{hovered.ghost
            ? " · unresolved"
            : ""}</span
        >
      {:else}
        <span
          >{visibleGraph.nodes.length} nodes · {visibleGraph.edges.length} links</span
        >
      {/if}
    </div>
  {/if}
</section>
