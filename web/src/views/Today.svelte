<script>
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Ring from '../parts/Ring.svelte';
  import { S, G, mem, mName, taskOf } from '../lib/store.svelte.js';
  import { start, finish, redo, cancel, join, dropEntry, redeem } from '../lib/act.js';
  import { open } from '../lib/ui.svelte.js';
  import { roomOf } from '../lib/rooms.js';
  import Extra from '../sheets/Extra.svelte';
  import Royal from '../sheets/Royal.svelte';

  let room = $state('alle');
  const c = $derived(G.calc), me = $derived(G.me), d = $derived(c.d);
  const my = $derived(c.per[me.id]);
  const left = $derived(Math.max(0, my.goal - my.today));
  const mins = iso => Math.max(0, Math.floor((S.now - new Date(iso)) / 60000));
  const roomName = e => (e.task_id === 'adhoc' ? 'Extra' : taskOf(e.task_id)?.room || 'Extra');

  // Meins: nachbessern, läuft gerade, noch zu tun, heute erledigt
  const mine = $derived(S.entries.filter(e => L.involved(e, me.id)));
  const fix = $derived(mine.filter(e => e.status === 'done' && e.review === 'nach'));
  const running = $derived(mine.filter(e => e.status === 'started'));
  const assigned = $derived(mine.filter(e => e.status === 'todo'));
  const ptsFor = e => (e.task_id === 'adhoc' ? e.points : L.ptsOf(taskOf(e.task_id)));
  const personal = $derived(L.personalTasksFor(c.st, me, d).filter(t => !L.entryFor(c.ix, t, d, me.id)));
  const doneToday = $derived(mine.filter(e => e.status === 'done' && !L.ADMIN_KINDS.has(e.task_id) && L.dKey(new Date(e.after_at)) === c.today));
  const mineCount = $derived(fix.length + running.length + assigned.length + personal.length);

  // Offen: gemeinsame Aufgaben, die heute dran oder liegengeblieben sind
  const openTasks = $derived(G.shared.filter(t => !L.entryFor(c.ix, t, d, null))
    .sort((a, b) => (G.kid ? (b.leicht ? 1 : 0) - (a.leicht ? 1 : 0) : 0) || (L.overdueInPeriod(b, d) ? 1 : 0) - (L.overdueInPeriod(a, d) ? 1 : 0)));
  const rooms = $derived([...new Set(openTasks.map(t => t.room))]);
  const inRoom = name => room === 'alle' || name === room;
  const others = $derived(S.entries.filter(e => e.status === 'started' && !L.involved(e, me.id) && e.task_id !== 'adhoc'));
  const early = $derived(S.tasks.filter(t => t.active && !t.per_person && (t.freq === 'weekly' || t.freq === 'monthly') && !L.dueOn(t, d) && !L.overdueInPeriod(t, d) && !L.entryFor(c.ix, t, d, null)));
  $effect(() => { if (room !== 'alle' && !rooms.includes(room)) room = 'alle'; });

  const royals = $derived(L.royals(c.st, d));
  const iAmRoyal = $derived(royals.some(r => r.m.id === me.id));
  const royalDay = $derived(iAmRoyal && L.royalDayTaken(c.st, me, d));
  const washToday = $derived(+me.waschtag === L.isoDay(d)), washTomorrow = $derived(+me.waschtag === L.isoDay(d) % 7 + 1);
  const greet = $derived(L.isoDay(d) >= 6 ? 'Schönes Wochenende' : ['Guten Morgen', 'Hallo', 'Na'][Math.min(2, Math.floor(d.getHours() / 8))]);
</script>

{#snippet tile(name)}
  {@const r = roomOf(name, S.settings)}
  <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
{/snippet}

<div class="narrow">
  <section class="hero">
    <Ring value={my.today} goal={my.goal} />
    <div class="grow">
      <h1>{greet}, {me.name} {me.emoji}</h1>
      <p>{!my.goal ? 'Heute hast du frei' : left ? `Noch ${left} Punkte bis zum Tagesziel` : 'Tagesziel geschafft!'}</p>
      <div class="chips">
        <span class="chip"><Icon name="flame" size={14} />{my.streak} {my.streak === 1 ? 'Tag' : 'Tage'}</span>
        <span class="chip"><Icon name="star" size={14} />{my.week} diese Woche</span>
        <span class="chip"><Icon name="piggy-bank" size={14} />{my.bank} im Konto</span>
      </div>
      {#if my.bank > 0 && left > 0}
        <button class="btn white sm" style="margin-top:10px" onclick={() => confirm(`${Math.min(my.bank, left)} Punkte vom Konto einlösen? Dann ist das Tagesziel geschafft.`) && redeem()}><Icon name="piggy-bank" size={16} />{Math.min(my.bank, left)} Punkte einlösen</button>
      {/if}
    </div>
  </section>

  {#if washToday}<div class="strip c-info"><Icon name="shirt" size={16} />Heute ist dein Waschtag: Korb runterbringen</div>
  {:else if washTomorrow}<div class="strip c-info"><Icon name="shirt" size={16} />Morgen ist dein Waschtag</div>{/if}
  {#if royals.length}
    <div class="strip c-warn">
      <Icon name="crown" size={16} />
      <span class="grow">{royals.map(r => `${L.royalTitle(r.m)} ${r.m.name}`).join(' & ')} {royals.length > 1 ? 'regieren' : 'regiert'} diese Woche ({royals[0].pts} P)
        {#if royalDay}· dein freier Tag: {L.DAYS[L.isoDay(new Date(royalDay.after_at))]}{/if}</span>
      {#if iAmRoyal && !royalDay}<button class="btn warn sm" onclick={() => open(Royal)}>Freien Tag wählen</button>{/if}
    </div>
  {/if}

  {#if mineCount}
    <div class="sec-h"><h2>Meins</h2><span class="cnt">{mineCount}</span></div>
    <section class="card list">
      {#each fix as e (e.id)}
        <div class="row">
          <span class="tile c-warn"><Icon name="rotate-ccw" /></span>
          <div class="grow"><b>{e.title}</b><small><span class="late">Bitte nachbessern</span>{e.review_note ? `: ${e.review_note}` : ''}</small></div>
          <button class="btn warn sm" onclick={() => redo(e)}><Icon name="camera" size={16} />Neues Foto</button>
        </div>
      {/each}
      {#each running as e (e.id)}
        <div class="row">
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small>läuft seit {mins(e.before_at)} Min{e.helpers.length ? ` · im Team mit ${[e.member_id, ...e.helpers].filter(x => x !== me.id).map(mName).join(', ')}` : ''}</small></div>
          {#if e.member_id === me.id}
            <button class="icb" onclick={() => cancel(e)} aria-label="Abbrechen"><Icon name="x" size={16} /></button>
            <button class="btn ok sm" onclick={() => finish(e)}><Icon name="camera" size={16} />Fertig</button>
          {:else}
            <span class="chip c-brand"><Icon name="handshake" size={14} />Du hilfst mit</span>
          {/if}
        </div>
      {/each}
      {#each assigned as e (e.id)}
        <div class="row">
          <span class="tile c-brand"><Icon name="clipboard-list" /></span>
          <div class="grow"><b>{e.title}</b><small><span class="pts">+{ptsFor(e)} P</span>{e.created_by && e.created_by !== me.id ? ` · von ${mName(e.created_by)} zugewiesen` : ''}</small></div>
          {#if e.created_by === me.id}<button class="icb" onclick={() => dropEntry(e)} aria-label="Von der Liste nehmen"><Icon name="x" size={16} /></button>{/if}
          <button class="btn sm" onclick={() => start({ entry: e })}><Icon name="camera" size={16} />Start</button>
        </div>
      {/each}
      {#each personal as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)} P</span> · ~{t.minutes} Min{t.freq === 'monthly' ? ' · bis Monatsende' : t.freq === 'weekend' ? ' · dieses Wochenende' : ''}</small></div>
          <button class="btn sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Start</button>
        </div>
      {/each}
    </section>
  {/if}

  <div class="sec-h">
    <h2>Offen</h2><span class="cnt grow">{openTasks.length} {openTasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}</span>
    <button class="btn sec sm" onclick={() => open(Extra)}><Icon name="plus" size={16} />Extra</button>
  </div>
  {#if rooms.length > 1}
    <div class="filter">
      <button class:on={room === 'alle'} onclick={() => (room = 'alle')}>Alle <em>{openTasks.length}</em></button>
      {#each rooms as r (r)}
        <button class:on={room === r} onclick={() => (room = r)}><Icon name={roomOf(r, S.settings).icon} size={16} />{r} <em>{openTasks.filter(t => t.room === r).length}</em></button>
      {/each}
    </div>
  {/if}
  <section class="card list">
    {#each others.filter(e => inRoom(roomName(e))) as e (e.id)}
      <div class="row">
        <span class="ava sm">{mem(e.member_id)?.emoji || '🙂'}</span>
        <div class="grow"><b>{e.title}</b><small>{mName(e.member_id)}{e.helpers.length ? ' + ' + e.helpers.map(mName).join(', ') : ''} ist dran · seit {mins(e.before_at)} Min</small></div>
        <button class="btn sec sm" onclick={() => join(e)}><Icon name="handshake" size={16} />Mithelfen</button>
      </div>
    {/each}
    {#each openTasks.filter(t => inRoom(t.room)) as t (t.id)}
      <div class="row">
        {@render tile(t.room)}
        <div class="grow">
          <b>{t.title}</b>
          <small><span class="pts">+{L.ptsOf(t)} P</span> · ~{t.minutes} Min{#if L.overdueInPeriod(t, d)} · <span class="late">liegt {L.lateLabel(t)}</span>{/if}{G.kid ? (t.leicht ? ' · leicht' : ' · mit Hilfe') : ''}</small>
        </div>
        <button class="btn sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Start</button>
      </div>
    {:else}
      {#if !others.length}<p class="empty">Alles erledigt. Die Bude glänzt!</p>{/if}
    {/each}
  </section>

  {#if early.length}
    <details class="card list">
      <summary><Icon name="chevron-down" />Später dran, schon vorziehen? <span class="cnt">{early.length}</span></summary>
      {#each early as t (t.id)}
        <div class="row">
          {@render tile(t.room)}
          <div class="grow"><b>{t.title}</b><small><span class="pts">+{L.ptsOf(t)} P</span> · {t.freq === 'weekly' ? `eigentlich ${L.DAYS[t.day || 1]}` : `eigentlich ab dem ${t.day || 1}.`}</small></div>
          <button class="btn sec sm" onclick={() => start({ task: t })}><Icon name="camera" size={16} />Jetzt</button>
        </div>
      {/each}
    </details>
  {/if}
  {#if doneToday.length}
    <details class="card list">
      <summary><Icon name="circle-check" />Heute von dir erledigt <span class="cnt">{doneToday.length}</span></summary>
      {#each doneToday as e (e.id)}
        <div class="row">
          {@render tile(roomName(e))}
          <div class="grow"><b>{e.title}</b><small>{new Date(e.after_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr{e.helpers.length ? ' · im Team' : ''}</small></div>
          <span class="pts">+{L.shares(e)[me.id] ?? e.points}</span>
        </div>
      {/each}
    </details>
  {/if}
</div>
