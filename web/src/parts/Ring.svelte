<script>
  let { value = 0, goal = 0, size = 76 } = $props();
  const r = $derived((size - 10) / 2), c = $derived(2 * Math.PI * r);
  const p = $derived(goal ? Math.min(1, value / goal) : 1);
</script>

<span class="ringw">
  <svg class="ring" width={size} height={size}>
    <circle cx={size / 2} cy={size / 2} {r} class="rbg" />
    <circle cx={size / 2} cy={size / 2} {r} class="rfg" stroke-dasharray={c} stroke-dashoffset={c * (1 - p)} transform="rotate(-90 {size / 2} {size / 2})" />
  </svg>
  <b>{value}{#if goal}<small>/{goal}</small>{/if}</b>
</span>
