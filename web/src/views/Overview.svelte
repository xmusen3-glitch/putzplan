<script>
  // Admin-Übersicht: der ganze Tag auf einen Blick.
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import { S, G } from '../lib/store.svelte.js';
  import { open } from '../lib/ui.svelte.js';
  import { roomOf } from '../lib/rooms.js';
  import Review from '../sheets/Review.svelte';
  import Proposals from '../sheets/Proposals.svelte';
  import Late from '../sheets/Late.svelte';
  import Person from '../sheets/Person.svelte';
  import Action from '../sheets/Action.svelte';

  const c = $derived(G.calc), d = $derived(c.d);
  const dateLabel = $derived(d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
  const shared = $derived(G.shared.map(t => ({ t, e: L.entryFor(c.ix, t, d, null) })));
  const doneCount = $derived(shared.filter(x => x.e?.status === 'done').length);
  const runningEntries = $derived(S.entries.filter(e => e.status === 'started'));
  const fixing = $derived(S.entries.filter(e => e.status === 'done' && e.review === 'nach').length);
  const inbox = $derived([
    G.queue.length && { icon: 'eye', c: 'brand', title: 'Fotos prüfen', sub: `${G.queue.length} neue Vorher/Nachher-Paare`, go: () => open(Review) },
    G.proposals.length && { icon: 'lightbulb', c: 'warn', title: 'Vorschläge', sub: `${G.proposals.length} neue Aufgaben-Ideen`, go: () => open(Proposals) },
    G.late.length && { icon: 'hourglass', c: 'bad', title: 'Liegengeblieben', sub: `${G.late.length} ${G.late.length === 1 ? 'Aufgabe wartet' : 'Aufgaben warten'} schon länger`, go: () => open(Late) },
  ].filter(Boolean));

  function status(m) {
    const p = c.per[m.id];
    if (L.isAway(m, d)) return ['info', 'Abwesend'];
    if (!p.goal) return ['info', 'Heute frei'];
    if (p.today >= p.goal) return ['ok', 'Fertig'];
    if (runningEntries.some(e => L.involved(e, m.id))) return ['brand', 'Putzt gerade'];
    return p.today ? ['warn', 'Dabei'] : ['bad', 'Noch nichts'];
  }
  // Wochenraster: Montag bis Sonntag der laufenden Woche
  const week = $derived(Array.from({ length: 7 }, (_, i) => L.noon(d, L.isoDay(d) - 1 - i)));
  const since = $derived(S.entries.length ? L.dKey(new Date(S.entries.reduce((a, e) => (e.created_at < a ? e.created_at : a), S.entries[0].created_at))) : c.today);
  const rooms = $derived([...new Set(shared.map(x => x.t.room))].map(name => {
    const xs = shared.filter(x => x.t.room === name);
    return { name, total: xs.length, done: xs.filter(x => x.e?.status === 'done').length, late: xs.filter(x => !x.e && L.overdueInPeriod(x.t, d)).length, ...roomOf(name, S.settings) };
  }));
</script>

{#snippet kpi(icon, color, value, label, onclick)}
  <button class="kpi" {onclick} disabled={!onclick}>
    <span class="tile c-{color}"><Icon name={icon} /></span>
    <span><b>{@render value()}</b><small>{label}</small></span>
  </button>
{/snippet}

<div class="top">
  <div class="grow"><h1>Übersicht</h1><p class="sub">{dateLabel}</p></div>
  <button class="btn sec sm" onclick={() => { S.tab = 'verwaltung'; scrollTo(0, 0); }}><Icon name="settings" size={16} />Verwaltung</button>
</div>

<div class="kpis">
  {#snippet v1()}{doneCount}<small>/{shared.length}</small>{/snippet}
  {#snippet v2()}{runningEntries.length}{/snippet}
  {#snippet v3()}{G.late.length}{/snippet}
  {#snippet v4()}{G.queue.length}{/snippet}
  {@render kpi('circle-check', 'ok', v1, 'Heute erledigt')}
  {@render kpi('timer', 'info', v2, 'Läuft gerade')}
  {@render kpi('hourglass', 'bad', v3, 'Liegengeblieben', G.late.length ? () => open(Late) : null)}
  {@render kpi('eye', 'brand', v4, 'Zu prüfen', G.queue.length ? () => open(Review) : null)}
</div>

<div class="cols">
  <div>
    <section class="card list">
      <h2>Wartet auf dich</h2>
      {#each inbox as x (x.title)}
        <button class="row" onclick={x.go}><span class="tile c-{x.c}"><Icon name={x.icon} /></span><span class="grow"><b>{x.title}</b><small>{x.sub}</small></span><Icon name="chevron-right" /></button>
      {:else}
        <p class="sub">Nichts offen. Alles im Griff.</p>
      {/each}
      {#if fixing}<p class="hint">{fixing} {fixing === 1 ? 'Aufgabe wird' : 'Aufgaben werden'} gerade nachgebessert.</p>{/if}
    </section>

    <section class="card">
      <h2>Familie heute <small>antippen für Details</small></h2>
      <div class="people">
        {#each G.active as m (m.id)}
          {@const p = c.per[m.id]}
          {@const [color, text] = status(m)}
          <button class="pcell" onclick={() => open(Person, { id: m.id })}>
            <span class="ava sm">{m.emoji}</span>
            <span class="grow">
              <b>{m.name}</b> <span class="n">{p.today}{p.goal ? '/' + p.goal : ''}</span>
              <span class="bar" class:ok={p.goal > 0 && p.today >= p.goal}><i style="width:{p.goal ? Math.min(100, 100 * p.today / p.goal) : 0}%"></i></span>
              <small class="c-{color}">{text}</small>
            </span>
          </button>
        {/each}
      </div>
    </section>
  </div>

  <div>
    <section class="card">
      <h2>Diese Woche</h2>
      <table class="matrix">
        <thead><tr><th></th>{#each week as x (x.getTime())}<th class:now={L.dKey(x) === c.today}>{L.DAYS_SHORT[L.isoDay(x)]}</th>{/each}</tr></thead>
        <tbody>
          {#each G.active as m (m.id)}
            <tr>
              <td>{m.emoji} {m.name}</td>
              {#each week as x (x.getTime())}
                {@const s = L.dayState(c.st, c.ix, m, x, d, since)}
                <td>
                  {#if s === 'now'}<i class="dot now" style="--p:{Math.round(100 * c.per[m.id].today / (c.per[m.id].goal || 1))}%"></i>
                  {:else}<i class="dot {s}">{#if s === 'ok'}<Icon name="check" size={12} bold />{:else if s === 'miss'}<Icon name="x" size={12} bold />{:else if s === 'frei'}<Icon name="tree-palm" size={12} bold />{/if}</i>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="legend"><span><i class="dot ok"></i>Ziel geschafft</span><span><i class="dot teil"></i>teilweise</span><span><i class="dot miss"></i>nichts</span><span><i class="dot frei"></i>frei</span></div>
    </section>

    <section class="card list">
      <h2>Räume heute</h2>
      {#each rooms as r (r.name)}
        <div class="row">
          <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
          <span class="grow"><b>{r.name}</b><span class="bar" class:ok={r.done === r.total}><i style="width:{100 * r.done / r.total}%"></i></span></span>
          {#if r.late}<span class="chip c-bad"><Icon name="hourglass" size={14} />{r.late}</span>{/if}
          <b>{r.done}/{r.total}</b>
        </div>
      {:else}
        <p class="sub">Heute steht nichts Gemeinsames an.</p>
      {/each}
    </section>
  </div>
</div>

<section class="card">
  <h2>Schnell erledigt</h2>
  <div class="quick five">
    <button class="btn ok" onclick={() => open(Action, { kind: 'bonus' })}><Icon name="star" size={16} />Belohnung</button>
    <button class="btn bad" onclick={() => open(Action, { kind: 'warn' })}><Icon name="triangle-alert" size={16} />Abmahnung</button>
    <button class="btn info" onclick={() => open(Action, { kind: 'frei' })}><Icon name="tree-palm" size={16} />Frei geben</button>
    <button class="btn" onclick={() => open(Action, { kind: 'assign' })}><Icon name="clipboard-list" size={16} />Zuweisen</button>
    <button class="btn sec" onclick={() => open(Action, { kind: 'durchsage' })}><Icon name="megaphone" size={16} />Durchsage</button>
  </div>
</section>
