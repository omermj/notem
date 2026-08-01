<script lang="ts">
  import type { OpenFile } from "../stores/vault.svelte";

  let { file }: { file: OpenFile } = $props();
  const preview = $derived(file.content.slice(0, 200_000));
  const size = $derived(
    file.size >= 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.ceil(file.size / 1024)} KB`,
  );
</script>

<section class="file-placeholder">
  <span class="placeholder-icon" aria-hidden="true"
    >{file.kind === "binary" ? "01" : "Aa"}</span
  >
  <h2>
    {file.kind === "binary" ? "Binary file" : "Large file opened read-only"}
  </h2>
  <p>
    {file.kind === "binary"
      ? "NoteM cannot display or edit this file, but it remains untouched in your vault."
      : `${size}. Files larger than 10 MB are protected from in-app edits.`}
  </p>
  {#if file.kind === "text" && preview}
    <pre aria-label="Read-only file preview">{preview}</pre>
  {/if}
</section>
