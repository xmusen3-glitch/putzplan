<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G } from '../lib/store.svelte.js';
  let { title, close } = $props();
  let picked = $state([]);
  const toggle = id => (picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);
</script>

<Head {title} {close} />
<p class="sub">Alleine oder mit jemandem zusammen? Im Team werden die Punkte fair geteilt.</p>
<p class="f">Wer hilft mit?</p>
<div class="pick">
  {#each G.active.filter(m => m.id !== S.meId) as m (m.id)}
    <button class:on={picked.includes(m.id)} onclick={() => toggle(m.id)}>{m.emoji} {m.name}</button>
  {/each}
</div>
<button class="btn wide" style="margin-top:16px" onclick={() => close(picked)}><Icon name="camera" size={16} />{picked.length ? 'Los im Team: Vorher-Foto' : 'Los: Vorher-Foto'}</button>
