<script>
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import { S, G, mName, post } from '../lib/store.svelte.js';
  import { tryDo } from '../lib/ui.svelte.js';

  let seg = $state('woche');
  const FIELD = { heute: 'today', woche: 'week', monat: 'month' };
  const per = $derived(G.calc.per), f = $derived(FIELD[seg]);
  const ranked = $derived([...G.active].sort((a, b) => per[b.id][f] - per[a.id][f]));
  const max = $derived(Math.max(1, ...ranked.map(m => per[m.id][f])));
  const lead = $derived(per[ranked[0]?.id]?.[f] > 0 ? ranked[0].id : null);

  // Fair-O-Meter: Anteil an den Wochenpunkten gemessen an dem, was jeder laut Einstellung schaffen kann
  const total = $derived(ranked.reduce((s, m) => s + Math.max(0, per[m.id].week), 0));
  const share = m => +m.w_weekday * 5 + +m.w_weekend * 2;
  const wsum = $derived(ranked.reduce((s, m) => s + share(m), 0) || 1);
  function fair(m) {
    const soll = total * share(m) / wsum, q = soll ? per[m.id].week / soll : 0;
    return q >= 1.1 ? ['ok', 'flame', 'Mehr als genug'] : q >= 0.8 ? ['brand', 'thumbs-up', 'Passt'] : q >= 0.4 ? ['warn', 'hourglass', 'Da geht noch was'] : ['bad', 'circle-alert', 'Faultier-Alarm'];
  }
  const KIND = { bonus: ['ok', 'star'], warn: ['bad', 'triangle-alert'], frei: ['info', 'tree-palm'] };
  const rewards = $derived(S.entries.filter(e => KIND[e.task_id] && e.status === 'done').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15));
  const dayOf = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const revoke = e => confirm('Zurücknehmen?') && tryDo(() => post(`/entries/${e.id}/revoke`));
</script>

<div class="narrow">
  <div class="top"><h1>Rangliste</h1></div>
  <div class="seg">
    {#each [['heute', 'Heute'], ['woche', 'Woche'], ['monat', 'Monat']] as [k, l] (k)}<button class:on={seg === k} onclick={() => (seg = k)}>{l}</button>{/each}
  </div>
  {#if seg === 'woche'}<p class="sub" style="margin:0 2px 10px">Wer am Sonntagabend vorne liegt, regiert nächste Woche und darf sich einen freien Tag aussuchen.</p>{/if}
  <section class="card list">
    {#each ranked as m, i (m.id)}
      {@const p = per[m.id]}
      <div class="row">
        <span class="rank {p[f] > 0 ? 'r' + (i + 1) : ''}">{i + 1}</span>
        <span class="ava sm">{m.emoji}</span>
        <div class="grow">
          <b>{m.name}</b>
          {#if lead === m.id && seg === 'woche'}<span class="chip c-warn"><Icon name="crown" size={14} />führt</span>{/if}
          <span class="bar" class:ok={seg === 'heute' && p.goal > 0 && p.today >= p.goal}><i style="width:{Math.max(0, 100 * p[f] / max)}%"></i></span>
          <small>
            {#if seg === 'heute'}{p.goal ? `Tagesziel ${p.goal}` : 'heute frei'}
            {:else if seg === 'woche'}{p.cnt} Aufgaben{p.streak ? ` · Serie ${p.streak}` : ''}{p.bonus ? ` · ${p.bonus}x belohnt` : ''}{p.warn ? ` · ${p.warn}x abgemahnt` : ''}
            {:else}Konto {p.bank} P{/if}
          </small>
        </div>
        <span class="num">{p[f]}</span>
      </div>
    {/each}
  </section>

  {#if total > 0}
    <section class="card list">
      <h2><Icon name="scale" />Fair-O-Meter <small>diese Woche, gemessen am eigenen Pensum</small></h2>
      {#each ranked as m (m.id)}
        {@const [c, icon, text] = fair(m)}
        <div class="row"><span class="grow">{m.emoji} <b>{m.name}</b></span><span class="chip c-{c}"><Icon name={icon} size={14} />{text}</span></div>
      {/each}
    </section>
  {/if}

  {#if rewards.length}
    <section class="card list">
      <h2>Belohnungen, Abmahnungen, freie Tage</h2>
      {#each rewards as e (e.id)}
        <div class="row">
          <span class="tile c-{KIND[e.task_id][0]}"><Icon name={KIND[e.task_id][1]} /></span>
          <div class="grow"><b>{mName(e.member_id)}: {e.title}</b><small>{e.task_id === 'frei' ? `frei am ${dayOf(e.after_at)}` : `${dayOf(e.after_at)} · ${e.points > 0 ? '+' : '−'}${Math.abs(e.points)} P`}</small></div>
          {#if G.admin}<button class="icb" onclick={() => revoke(e)} aria-label="Zurücknehmen"><Icon name="undo-2" size={16} /></button>{/if}
        </div>
      {/each}
    </section>
  {/if}
</div>
