<script lang="ts">
  let { text }: { text: string } = $props();
  const parts = $derived(
    text
      .split(/([\uE000\uE001])/)
      .reduce<{ text: string; highlighted: boolean }[]>((result, part) => {
        if (part === "\uE000") {
          result.push({ text: "", highlighted: true });
        } else if (part === "\uE001") {
          result.push({ text: "", highlighted: false });
        } else {
          const current = result.at(-1);
          if (current) current.text += part;
          else result.push({ text: part, highlighted: false });
        }
        return result;
      }, []),
  );
</script>

<span class="highlighted-snippet">
  {#each parts as part, index (`${index}:${part.highlighted}`)}
    {#if part.highlighted}<mark>{part.text}</mark>{:else}{part.text}{/if}
  {/each}
</span>
