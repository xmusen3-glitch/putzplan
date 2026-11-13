<script>
  import Icon from '../parts/Icon.svelte';
  import { S, join } from '../lib/store.svelte.js';
  import { tryDo } from '../lib/ui.svelte.js';
  let link = $state('');
</script>

<div class="gate">
  <img class="logo" src="/icon-192.png" alt="" />
  <h1>Familien-Putzplan</h1>
  <p class="sub" style="margin:6px 0 18px">Vorher-Foto, putzen, Nachher-Foto, Haken dran.</p>
  {#if S.joinError}<div class="strip c-bad"><Icon name="circle-alert" size={16} />{S.joinError}</div>{/if}
  <div class="card" style="text-align:left">
    <h2><Icon name="link" size={18} />Du hast einen Einladungslink?</h2>
    <p class="sub" style="margin-bottom:10px">Öffne ihn einfach. Oder kopiere ihn und füge ihn hier ein:</p>
    <input class="inp" bind:value={link} placeholder="Einladungslink einfügen" onkeydown={e => e.key === 'Enter' && link.trim() && tryDo(() => join(link))} />
    <button class="btn wide" style="margin-top:10px" disabled={!link.trim()} onclick={() => tryDo(() => join(link))}>Los geht's</button>
  </div>
  <p class="sub">Den Link bekommst du von den Admins der Familie.</p>
</div>
