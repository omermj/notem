<script lang="ts">
  let {
    checked,
    label,
    onchange,
  }: {
    checked: boolean;
    label: string;
    onchange: (checked: boolean) => void;
  } = $props();
</script>

<button
  class="setting-toggle"
  class:active={checked}
  type="button"
  role="switch"
  aria-label={label}
  aria-checked={checked}
  onclick={() => onchange(!checked)}
>
  <span aria-hidden="true"></span>
</button>
