<script>
  // Vorher/Nachher als Vorschaubilder. Antippen öffnet beide groß.
  import Icon from './Icon.svelte';
  import { open } from '../lib/ui.svelte.js';
  import Zoom from '../sheets/Zoom.svelte';
  let { entry } = $props();
  const zoom = () => (entry.before_photo || entry.after_photo) && open(Zoom, { entry });
</script>

<div class="pair">
  {#each [['before_photo', 'Vorher'], ['after_photo', 'Nachher']] as [key, label] (key)}
    <button class="ph" onclick={zoom} aria-label="{label}-Foto groß ansehen">
      {#if entry[key]}
        <img src="/photos/{entry[key]}.t.jpg" alt={label} loading="lazy" decoding="async" />
      {:else if key === 'after_photo' && entry.status === 'started'}
        <Icon name="hourglass" size={28} />
      {:else}
        <Icon name="image-off" size={28} />
      {/if}
      <span>{label}</span>
    </button>
  {/each}
</div>
