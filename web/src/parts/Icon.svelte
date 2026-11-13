<script>
  let { name, size = 20, bold = false } = $props();
</script>

<svg class="ic" width={size} height={size} stroke-width={bold ? 3 : 2} aria-hidden="true"><use href="#i-{name}" /></svg>
