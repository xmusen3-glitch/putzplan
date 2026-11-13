<script>
  import Head from '../parts/Head.svelte';
  let { entry, close } = $props();
  const shots = $derived([['before_photo', 'Vorher'], ['after_photo', 'Nachher']].filter(([k]) => entry[k]));
</script>

<Head title={entry.title} {close} />
<div class="zoom" class:two={shots.length === 2}>
  {#each shots as [key, label] (key)}
    <div class="ph" style="aspect-ratio:auto"><img src="/photos/{entry[key]}.jpg" alt={label} /><span>{label}</span></div>
  {/each}
</div>
