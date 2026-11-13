<script>
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G } from '../lib/store.svelte.js';
  let { member = null, close } = $props();
  const m = $derived(member || G.me);
  const KIND = { bonus: ['ok', 'star'], warn: ['bad', 'triangle-alert'], frei: ['info', 'tree-palm'], redeem: ['warn', 'piggy-bank'] };
  const rows = $derived(S.entries.filter(e => e.status === 'done' && e.after_at && L.involved(e, m.id)).sort((a, b) => b.after_at.localeCompare(a.after_at)).slice(0, 60));
  const when = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const pts = e => L.shares(e)[m.id] ?? e.points;
</script>

<Head title="Punkte von {m.name}" {close} />
<div class="list">
  {#each rows as e (e.id)}
    {@const k = KIND[e.task_id] || ['brand', 'check']}
    <div class="row">
      <span class="tile c-{k[0]}"><Icon name={k[1]} /></span>
      <div class="grow"><b>{e.title}</b><small>{when(e.after_at)}{e.helpers.length ? ' · im Team geteilt' : ''}{e.review === 'nach' ? ' · nachbessern' : ''}</small></div>
      <span class="pts">{e.task_id === 'frei' || e.task_id === 'redeem' ? '' : pts(e) > 0 ? '+' + pts(e) : pts(e)}</span>
    </div>
  {:else}
    <p class="empty">Noch keine Einträge.</p>
  {/each}
</div>
