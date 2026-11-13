<script>
  import Icon from './Icon.svelte';
  let { title, close, children } = $props();
</script>

<div class="sh-head">
  <h2>{title}</h2>
  {@render children?.()}
  <button class="icb" onclick={() => close()} aria-label="Schließen"><Icon name="x" size={16} /></button>
</div>
