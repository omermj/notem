<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { GraphNode, LinkGraph } from "../api";
  import { GraphRenderer, type GraphForces } from "../graph/GraphRenderer";

  export interface GraphViewCommand {
    id: number;
    action: "fit" | "zoom-in" | "zoom-out";
  }

  let {
    graph,
    forces,
    centerId = null,
    compact = false,
    viewCommand = null,
    onopen,
    onhover,
  }: {
    graph: LinkGraph;
    forces: GraphForces;
    centerId?: string | null;
    compact?: boolean;
    viewCommand?: GraphViewCommand | null;
    onopen: (node: GraphNode) => void;
    onhover: (node: GraphNode | null) => void;
  } = $props();

  let canvas: HTMLCanvasElement;
  let renderer: GraphRenderer | null = null;
  let lastViewCommand = 0;

  onMount(() => {
    renderer = new GraphRenderer(canvas, onopen, onhover);
    renderer.setData(graph, forces, centerId, compact);
    return () => renderer?.destroy();
  });

  $effect(() => {
    const nextGraph = graph;
    const nextCenter = centerId;
    const nextCompact = compact;
    renderer?.setData(
      nextGraph,
      untrack(() => forces),
      nextCenter,
      nextCompact,
    );
  });

  $effect(() => {
    renderer?.setForces({
      strength: forces.strength,
      linkDistance: forces.linkDistance,
    });
  });

  $effect(() => {
    const command = viewCommand;
    if (!command || command.id === lastViewCommand) return;
    lastViewCommand = command.id;
    if (command.action === "fit") renderer?.fitToView();
    else if (command.action === "zoom-in") renderer?.zoomIn();
    else renderer?.zoomOut();
  });
</script>

<canvas
  bind:this={canvas}
  class="graph-canvas"
  aria-label="Interactive note graph"
></canvas>
