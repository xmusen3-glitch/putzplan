<script>
  // Verwaltung für Admins: Aufgaben, Familie, Regeln, Protokoll.
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import { S, G, mem, mName, post, put } from '../lib/store.svelte.js';
  import { open, toast, tryDo } from '../lib/ui.svelte.js';
  import { roomOf, allRooms } from '../lib/rooms.js';
  import TaskEdit from '../sheets/TaskEdit.svelte';
  import MemberEdit from '../sheets/MemberEdit.svelte';
  import Person from '../sheets/Person.svelte';
  import Invite from '../sheets/Invite.svelte';
  import IconPick from '../sheets/IconPick.svelte';

  let tab = $state('aufgaben'), search = $state(''), room = $state('alle');
  const tasks = $derived(S.tasks.filter(t => !t.proposed_by).sort((a, b) => a.room.localeCompare(b.room) || a.title.localeCompare(b.title)));
  const rooms = $derived([...new Set(tasks.map(t => t.room))]);
  const shown = $derived(tasks.filter(t => (room === 'alle' || t.room === room) && t.title.toLowerCase().includes(search.trim().toLowerCase())));
  const meta = t => `${L.FREQ[t.freq]}${t.freq === 'weekly' ? ` (${L.DAYS_SHORT[t.day || 1]})` : t.freq === 'monthly' ? ` (ab ${t.day || 1}.)` : ''} · ${t.minutes} Min · ${L.ptsOf(t)} P${t.leicht ? ' · auch für Kinder' : ''}${t.per_person ? ' · jeder für sich' : ''}`;
  const toggle = t => tryDo(() => post(`/tasks/${t.id}/active`, { active: !t.active }));

  const load = v => (v === 0 ? 'nichts' : v < 0.5 ? 'ganz wenig' : v < 1 ? 'weniger' : v === 1 ? 'normal' : 'mehr');
  const info = m => `${m.role === 'kind' ? 'nur leichte Aufgaben · ' : ''}Mo–Fr ${load(+m.w_weekday)} · WE ${load(+m.w_weekend)}${m.waschtag ? ` · Waschtag ${L.DAYS_SHORT[m.waschtag]}` : ''}`;
  const day = k => k.split('-').reverse().slice(0, 2).join('.') + '.';

  // Regeln: erst lokal ändern, dann speichern
  let rules = $state({ ...S.settings });
  const dirty = $derived(['tagesziel', 'min_minutes', 'review_first', 'koch_regel', 'erinnerung'].some(k => rules[k] !== S.settings[k]));
  const saveRules = async () => (await tryDo(() => put('/settings', rules))) && toast('Regeln gespeichert');

  const stamp = iso => { const d = new Date(iso); return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
  const undo = l => confirm('Diese Aktion zurücknehmen?') && tryDo(() => post(`/log/${l.id}/undo`));
</script>

{#snippet sw(on, onclick, label)}
  <button class="sw" class:on {onclick} role="switch" aria-checked={on} aria-label={label}><i></i></button>
{/snippet}

<div class="narrow">
  <div class="top">
    <h1 class="grow">Verwaltung</h1>
    <button class="btn sec sm" onclick={() => { S.tab = 'uebersicht'; scrollTo(0, 0); }}><Icon name="layout-dashboard" size={16} />Übersicht</button>
  </div>
  <div class="seg">
    {#each [['aufgaben', 'Aufgaben'], ['familie', 'Familie'], ['regeln', 'Regeln'], ['protokoll', 'Protokoll']] as [k, l] (k)}<button class:on={tab === k} onclick={() => (tab = k)}>{l}</button>{/each}
  </div>

  {#if tab === 'aufgaben'}
    <div class="row" style="margin-bottom:10px">
      <input class="inp" bind:value={search} placeholder="Aufgabe suchen" />
      <button class="btn sm" onclick={() => open(TaskEdit)}><Icon name="plus" size={16} />Neu</button>
    </div>
    <div class="filter">
      <button class:on={room === 'alle'} onclick={() => (room = 'alle')}>Alle <em>{tasks.length}</em></button>
      {#each rooms as r (r)}<button class:on={room === r} onclick={() => (room = r)}><Icon name={roomOf(r, S.settings).icon} size={16} />{r}</button>{/each}
    </div>
    <section class="card list">
      {#each shown as t (t.id)}
        {@const r = roomOf(t.room, S.settings)}
        <div class="row" style={t.active ? '' : 'opacity:.55'}>
          <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
          <div class="grow"><b>{t.title}</b><small>{meta(t)}</small></div>
          <button class="icb" onclick={() => open(TaskEdit, { task: t })} aria-label="Bearbeiten"><Icon name="pencil" size={16} /></button>
          {@render sw(t.active, () => toggle(t), 'Aufgabe aktiv')}
        </div>
      {:else}
        <p class="empty">Nichts gefunden.</p>
      {/each}
    </section>
  {:else if tab === 'familie'}
    <section class="card list">
      {#each S.members as m (m.id)}
        <button class="row" style={m.active ? '' : 'opacity:.55'} onclick={() => open(m.active ? Person : MemberEdit, m.active ? { id: m.id } : { member: m })}>
          <span class="ava">{m.emoji}</span>
          <span class="grow">
            <b>{m.name}</b> <span class="chip c-brand">{L.ROLES[m.role]}</span>
            {#if !m.active}<span class="chip">pausiert</span>{:else if m.away_from && m.away_to >= G.calc.today}<span class="chip c-info">abwesend {day(m.away_from)} bis {day(m.away_to)}</span>{/if}
            {#if m.pin_help}<span class="chip c-warn"><Icon name="key-round" size={14} />PIN vergessen</span>{/if}
            <small>{info(m)}{m.has_pin ? '' : ' · noch keine PIN'}</small>
          </span>
          <Icon name="chevron-right" />
        </button>
      {/each}
    </section>
    <div class="quick">
      <button class="btn" onclick={() => open(MemberEdit)}><Icon name="user-plus" size={16} />Person hinzufügen</button>
      <button class="btn sec" onclick={() => open(Invite)}><Icon name="qr-code" size={16} />Einladen</button>
    </div>
  {:else if tab === 'regeln'}
    <section class="card list">
      <div class="row"><span class="icb"><Icon name="target" /></span><span class="grow"><b>Tagesziel</b><small>Punkte für eine Person mit normalem Pensum</small></span><input class="inp num-in" type="number" min="1" max="50" bind:value={rules.tagesziel} /></div>
      <div class="row"><span class="icb"><Icon name="timer" /></span><span class="grow"><b>Mindestzeit zwischen den Fotos</b><small>in Minuten</small></span><input class="inp num-in" type="number" min="0" max="60" bind:value={rules.min_minutes} /></div>
      <div class="row"><span class="icb"><Icon name="image" /></span><span class="grow"><b>Fotos bleiben dauerhaft gespeichert</b><small>Ältere lassen sich unter „Fotos“ nachladen</small></span><Icon name="infinity" /></div>
      <div class="row"><span class="icb"><Icon name="database-backup" /></span><span class="grow"><b>Letzte Sicherung</b><small>{S.backup ? stamp(S.backup) + ' · läuft jede Nacht' : 'noch keine gelaufen'}</small></span>{#if G.backupLate}<span class="chip c-bad">überfällig</span>{:else if S.backup}<span class="chip c-ok"><Icon name="check" size={14} />in Ordnung</span>{/if}</div>
      <div class="row"><span class="icb"><Icon name="eye" /></span><span class="grow"><b>Punkte zählen erst nach dem Prüfen</b><small>Aus: Punkte gibt es sofort, Ablehnen nimmt sie wieder weg</small></span>{@render sw(rules.review_first, () => (rules.review_first = !rules.review_first), 'Punkte erst nach dem Prüfen')}</div>
      <div class="row"><span class="icb"><Icon name="cooking-pot" /></span><span class="grow"><b>Wer kocht, räumt auf</b><small>Knopf unter „Extra“</small></span>{@render sw(rules.koch_regel, () => (rules.koch_regel = !rules.koch_regel), 'Koch-Regel')}</div>
      <div class="row"><span class="icb"><Icon name="bell" /></span><span class="grow"><b>Erinnerung ans Tagesziel</b><small>um 17 Uhr, wenn noch Punkte fehlen</small></span>{@render sw(rules.erinnerung, () => (rules.erinnerung = !rules.erinnerung), 'Erinnerung')}</div>
    </section>
    <button class="btn wide" disabled={!dirty} onclick={saveRules}>Regeln speichern</button>
    <div class="sec-h"><h2>Bereiche</h2><span class="cnt">Icon antippen zum Ändern</span></div>
    <section class="card">
      <div class="pick">
        {#each allRooms(S.tasks, S.settings) as name (name)}<button onclick={() => open(IconPick, { room: name })}><Icon name={roomOf(name, S.settings).icon} size={16} /> {name}</button>{/each}
      </div>
    </section>
  {:else}
    <p class="sub" style="margin-bottom:10px">Was Admins geändert haben, mit Zeit und Person. Vieles lässt sich hier zurücknehmen.</p>
    <section class="card list">
      {#each S.log as l (l.id)}
        <div class="row" style={l.undone ? 'opacity:.55' : ''}>
          <span class="ava sm">{mem(l.member_id)?.emoji || '🙂'}</span>
          <div class="grow"><b>{mName(l.member_id)}</b> {l.text}<small>{stamp(l.at)}{l.undone ? ' · zurückgenommen' : ''}</small></div>
          {#if l.can_undo}<button class="btn sec sm" onclick={() => undo(l)}><Icon name="undo-2" size={16} />Zurück</button>{/if}
        </div>
      {:else}
        <p class="empty">Noch keine Einträge.</p>
      {/each}
    </section>
  {/if}
</div>

<style>
  .num-in { width: 84px; text-align: center; flex: none; }
</style>
