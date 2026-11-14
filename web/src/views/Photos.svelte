<script>
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Pair from '../parts/Pair.svelte';
  import Reactions from '../parts/Reactions.svelte';
  import { S, G, mem, mName, loadOlder } from '../lib/store.svelte.js';
  import { open, tryDo } from '../lib/ui.svelte.js';
  import Review from '../sheets/Review.svelte';

  let who = $state('alle'), limit = $state(20), loading = $state(false);
  const when = e => e.after_at || e.before_at || e.created_at || '';
  // Erst die letzten Wochen aus dem geladenen Zustand, dahinter alles, was nachgeladen wurde. Fotos bleiben dauerhaft.
  const all = $derived.by(() => {
    const seen = new Set();
    return [...S.entries, ...S.older]
      .filter(e => !seen.has(e.id) && seen.add(e.id) && (e.status === 'done' || e.status === 'started') && !L.ADMIN_KINDS.has(e.task_id) && (who === 'alle' || L.involved(e, who)))
      .sort((a, b) => when(b).localeCompare(when(a)));
  });
  const yesterday = $derived(L.dKey(L.noon(G.calc.d, 1)));
  const dayLabel = iso => { const d = new Date(iso), k = L.dKey(d); return k === G.calc.today ? 'Heute' : k === yesterday ? 'Gestern' : `${L.DAYS[L.isoDay(d)]}, ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() === G.calc.d.getFullYear() ? '' : d.getFullYear()}`; };
  async function older() {
    loading = true;
    if (await tryDo(loadOlder)) limit += 30;
    loading = false;
  }
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
          {#if e.status === 'started' || G.admin || (e.review && L.involved(e, S.meId))}
            <span class="chip c-{st[0]}"><Icon name={st[1]} size={14} />{st[2]}</span>
          {/if}
        </div>
        <Pair entry={e} />
        {#if e.status === 'done'}<Reactions entry={e} />{/if}
        {#if G.admin && e.status === 'done'}
          <!-- Admins können jedes Urteil jederzeit ändern, auch bei schon Geprüftem -->
          <div class="row" style="margin-top:10px;gap:8px">
            {#if !e.review}
              <button class="btn sm grow" onclick={() => open(Review, { only: e.id })}><Icon name="eye" size={16} />Prüfen</button>
            {:else}
              <button class="btn sec sm grow" onclick={() => open(Review, { only: e.id })}><Icon name="pencil" size={16} />Urteil ändern oder ablehnen</button>
            {/if}
          </div>
        {/if}
      </article>
    {/each}
  {:else}
    <p class="empty wide">Noch keine Fotos. Zeit, das zu ändern!</p>
  {/each}
</div>
{#if all.length > limit}
  <button class="btn sec wide" onclick={() => (limit += 20)}>Mehr anzeigen ({all.length - limit})</button>
{:else if S.olderMore}
  <button class="btn sec wide" disabled={loading} onclick={older}><Icon name="history" size={16} />{loading ? 'Lädt …' : 'Ältere Fotos laden'}</button>
{/if}
