<script lang="ts">
  import { errorMessage, tags_all, type TagCount } from "../api";
  import { setTagFilter, showToast, uiState } from "../stores/ui.svelte";
  import type { TagDrag } from "../drag";
  import { beginInternalDrag } from "../internalDrag";

  interface TagNode {
    name: string;
    tag: string;
    count: number;
    children: TagNode[];
  }

  let tags = $state<TagCount[]>([]);

  $effect(() => {
    const revision = uiState.indexRevision;
    void tags_all()
      .then((result) => {
        if (revision === uiState.indexRevision) tags = result;
      })
      .catch((error: unknown) => showToast(errorMessage(error)));
  });

  const tree = $derived.by(() => {
    const roots: TagNode[] = [];
    for (const item of tags) {
      let siblings = roots;
      let path = "";
      for (const segment of item.tag.split("/")) {
        path = path ? `${path}/${segment}` : segment;
        let node = siblings.find((candidate) => candidate.name === segment);
        if (!node) {
          node = { name: segment, tag: path, count: 0, children: [] };
          siblings.push(node);
        }
        if (path === item.tag) node.count = item.count;
        siblings = node.children;
      }
    }
    const sort = (nodes: TagNode[]): TagNode[] =>
      nodes
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((node) => ({ ...node, children: sort(node.children) }));
    return sort(roots);
  });
</script>

{#snippet branch(nodes: TagNode[], depth: number)}
  {#each nodes as node (node.tag)}
    <button
      class:active={uiState.activeTagFilter === node.tag}
      class="tag-row"
      style:padding-left={`${8 + depth * 14}px`}
      type="button"
      title={`Drag #${node.tag} onto a note to add it`}
      onpointerdown={(event) => {
        const payload: TagDrag = { kind: "tag", tag: node.tag };
        beginInternalDrag(event, payload, { label: `#${node.tag}` });
      }}
      onclick={() => setTagFilter(node.tag)}
    >
      <span># {node.name}</span>
      {#if node.count}<span class="tag-count">{node.count}</span>{/if}
    </button>
    {@render branch(node.children, depth + 1)}
  {/each}
{/snippet}

<section class="tag-tree" aria-label="Tags">
  {#if tree.length}
    {@render branch(tree, 0)}
  {:else}
    <p class="muted">No tags in this vault.</p>
  {/if}
</section>
