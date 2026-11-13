<script>
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Pair from '../parts/Pair.svelte';
  import Reactions from '../parts/Reactions.svelte';
  import { S, G, mem, mName } from '../lib/store.svelte.js';
  import { open } from '../lib/ui.svelte.js';
  import Review from '../sheets/Review.svelte';

  let who = $state('alle'), limit = $state(20);
  const when = e => e.after_at || e.before_at || e.created_at || '';
  const all = $derived(S.entries
    .filter(e => (e.status === 'done' || e.status === 'started') && !L.ADMIN_KINDS.has(e.task_id) && (who === 'alle' || L.involved(e, who)))
    .sort((a, b) => when(b).localeCompare(when(a))));
  const yesterday = $derived(L.dKey(L.noon(G.calc.d, 1)));
  const dayLabel = iso => { const d = new Date(iso), k = L.dKey(d); return k === G.calc.today ? 'Heute' : k === yesterday ? 'Gestern' : `${L.DAYS[L.isoDay(d)]}, ${d.getDate()}.${d.getMonth() + 1}.`; };
  /** Einträge nach Tag gruppiert, damit jede Gruppe eine Überschrift bekommt. */
  const groups = $derived.by(() => {
    const out = [];
    for (const e of all.slice(0, limit)) { const label = dayLabel(when(e)); if (out.at(-1)?.label !== label) out.push({ label, items: [] }); out.at(-1).items.push(e); }
    return out;
  });
  const time = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const dur = e => Math.max(1, Math.round((new Date(e.after_at) - new Date(e.before_at)) / 60000));
  const STATE = { nach: ['warn', 'rotate-ccw', 'Nachbessern'], ok: ['ok', 'check', 'Geprüft'] };
</script>

<div class="top">
  <h1 class="grow">Fotos</h1>
  {#if G.admin && G.queue.length}<button class="btn sm" onclick={() => open(Review)}><Icon name="eye" size={16} />{G.queue.length} prüfen</button>{/if}
</div>
<div class="filter">
  <button class:on={who === 'alle'} onclick={() => { who = 'alle'; limit = 20; }}><Icon name="users" size={16} />Alle</button>
  {#each G.active as m (m.id)}<button class:on={who === m.id} onclick={() => { who = m.id; limit = 20; }}>{m.emoji} {m.name}</button>{/each}
</div>

<div class="feed">
  {#each groups as g (g.label)}
    <div class="sec-h wide"><h2>{g.label}</h2><span class="cnt">{g.items.length}</span></div>
    {#each g.items as e (e.id)}
      {@const st = e.status === 'started' ? ['brand', 'timer', 'Läuft'] : STATE[e.review] || ['brand', 'eye', 'Neu']}
      <article class="card">
        <div class="row">
          <span class="ava sm">{mem(e.member_id)?.emoji || '🙂'}</span>
          <div class="grow">
            <b>{e.title}</b>
            <small>{mName(e.member_id)}{e.helpers.length ? ' mit ' + e.helpers.map(mName).join(', ') : ''} · {#if e.status === 'done'}{time(e.after_at)} · {dur(e)} Min · +{e.points} P{:else}seit {time(e.before_at)}{/if}</small>
          </div>
          {#if G.admin && e.status === 'done'}
            <button class="chip c-{st[0]}" onclick={() => open(Review, { only: e.id })}><Icon name={st[1]} size={14} />{st[2]}</button>
          {:else if e.status === 'started' || (e.review && L.involved(e, S.meId))}
            <span class="chip c-{st[0]}"><Icon name={st[1]} size={14} />{st[2]}</span>
          {/if}
        </div>
        <Pair entry={e} />
        {#if e.status === 'done'}<Reactions entry={e} />{/if}
      </article>
    {/each}
  {:else}
    <p class="empty wide">Noch keine Fotos. Zeit, das zu ändern!</p>
  {/each}
</div>
{#if all.length > limit}<button class="btn sec wide" onclick={() => (limit += 20)}>Mehr anzeigen ({all.length - limit})</button>{/if}
