<script>
  // Wer hat womit reagiert? Öffnet sich, wenn man eine Reaktion gedrückt hält.
  import Head from '../parts/Head.svelte';
  import { reactionsOf, mem, mName } from '../lib/store.svelte.js';
  import { REACTS } from '../../../shared/logic.js';
  let { entry, close } = $props();
  const all = $derived(reactionsOf(entry.id).filter(r => r.emoji));
  const rows = $derived(REACTS.flatMap(e => all.filter(r => r.emoji === e).sort((a, b) => a.created_at.localeCompare(b.created_at))));
  const when = iso => new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<Head title="Wer hat reagiert?" {close} />
<p class="sub" style="margin-bottom:8px">{mName(entry.member_id)}: {entry.title}</p>
<div class="list">
  {#each rows as r (r.id)}
    <div class="row">
      <span class="ava sm">{r.emoji}</span>
      <div class="grow"><b>{mem(r.member_id)?.emoji || ''} {mName(r.member_id)}</b><small>{when(r.created_at)}</small></div>
    </div>
  {:else}
    <p class="empty">Noch keine Reaktionen.</p>
  {/each}
</div>
