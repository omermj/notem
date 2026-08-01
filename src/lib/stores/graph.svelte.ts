import {
  errorMessage,
  links_graph,
  type GraphEdge,
  type GraphNode,
  type LinkGraph,
} from "../api";
import { SvelteSet } from "svelte/reactivity";

class GraphStore {
  data = $state<LinkGraph>({ nodes: [], edges: [] });
  loading = $state(false);
  error = $state<string | null>(null);
  private revision = -1;
  private vaultKey = "";
  private pending: Promise<void> | null = null;

  async load(revision: number, vaultKey: string): Promise<void> {
    if (this.revision === revision && this.vaultKey === vaultKey) {
      return this.pending ?? Promise.resolve();
    }
    if (this.pending) await this.pending;
    if (this.revision === revision && this.vaultKey === vaultKey) return;
    if (this.vaultKey !== vaultKey) this.data = { nodes: [], edges: [] };
    this.loading = true;
    this.error = null;
    this.pending = links_graph()
      .then((data) => {
        this.data = data;
        this.revision = revision;
        this.vaultKey = vaultKey;
      })
      .catch((error: unknown) => {
        this.error = errorMessage(error);
      })
      .finally(() => {
        this.loading = false;
        this.pending = null;
      });
    await this.pending;
  }
}

export const graphState = new GraphStore();

export function neighborhood(
  graph: LinkGraph,
  center: string | null,
  depth: 1 | 2,
): LinkGraph {
  if (!center) return { nodes: [], edges: [] };
  const identity = center.replace(/\.md$/i, "");
  const included = new SvelteSet<string>([identity]);
  let frontier = new SvelteSet<string>([identity]);
  for (let level = 0; level < depth; level += 1) {
    const next = new SvelteSet<string>();
    for (const edge of graph.edges) {
      if (frontier.has(edge.source) && !included.has(edge.target)) {
        included.add(edge.target);
        next.add(edge.target);
      }
      if (frontier.has(edge.target) && !included.has(edge.source)) {
        included.add(edge.source);
        next.add(edge.source);
      }
    }
    frontier = next;
  }
  return {
    nodes: graph.nodes.filter((node) => included.has(node.id)),
    edges: graph.edges.filter(
      (edge) => included.has(edge.source) && included.has(edge.target),
    ),
  };
}

export function filterGraph(
  graph: LinkGraph,
  query: string,
  showGhosts: boolean,
): LinkGraph {
  const normalized = query.trim().toLocaleLowerCase();
  const included = new SvelteSet<string>();
  const nodes: GraphNode[] = [];
  for (const node of graph.nodes) {
    if (
      (!showGhosts && node.ghost) ||
      (normalized &&
        !node.title.toLocaleLowerCase().includes(normalized) &&
        !node.id.toLocaleLowerCase().includes(normalized))
    ) {
      continue;
    }
    included.add(node.id);
    nodes.push(node);
  }
  const edges: GraphEdge[] = [];
  for (const edge of graph.edges) {
    if (included.has(edge.source) && included.has(edge.target))
      edges.push(edge);
  }
  return { nodes, edges };
}
