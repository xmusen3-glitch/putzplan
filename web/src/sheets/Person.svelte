<script>
  // Alles zu einer Person an einem Ort (nur Admins).
  import * as L from '../../../shared/logic.js';
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, mem, post } from '../lib/store.svelte.js';
  import { open, toast, tryDo } from '../lib/ui.svelte.js';
  import Action from './Action.svelte';
  import MemberEdit from './MemberEdit.svelte';
  import Points from './Points.svelte';
  let { id, close } = $props();
  const m = $derived(mem(id)), p = $derived(G.calc.per[id]);
  const today = $derived(S.entries.filter(e => L.involved(e, id) && !L.ADMIN_KINDS.has(e.task_id) && ((e.status === 'done' && L.dKey(new Date(e.after_at)) === G.calc.today) || e.status === 'started' || e.status === 'todo')));
  const time = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const act = kind => open(Action, { kind, member: id });
  async function resetPin() {
    if (confirm(`PIN von ${m.name} zurücksetzen? Beim nächsten Öffnen legt ${m.name} eine neue fest.`) && (await tryDo(() => post(`/members/${id}/reset-pin`)))) toast('PIN zurückgesetzt');
  }
</script>

{#if m && p}
  <Head title="{m.emoji} {m.name}" {close}><span class="chip c-brand">{L.ROLES[m.role]}</span></Head>
  <div class="stats" style="margin:0 0 14px">
    <div><b>{p.today}{p.goal ? '/' + p.goal : ''}</b><small>heute</small></div>
    <div><b>{p.week}</b><small>Woche</small></div>
    <div><b>{p.streak}</b><small>Tage Serie</small></div>
    <div><b>{p.bank}</b><small>im Konto</small></div>
  </div>
  <div class="list">
    <h2>Heute</h2>
    {#each today as e (e.id)}
      <div class="row">
        <span class="tile c-{e.status === 'done' ? 'ok' : e.status === 'started' ? 'brand' : 'warn'}"><Icon name={e.status === 'done' ? 'check' : e.status === 'started' ? 'timer' : 'clipboard-list'} /></span>
        <div class="grow"><b>{e.title}</b><small>{e.status === 'done' ? `fertig um ${time(e.after_at)}` : e.status === 'started' ? `läuft seit ${time(e.before_at)}` : 'zugewiesen, noch nicht angefangen'}</small></div>
        {#if e.status === 'done'}<span class="pts">+{L.shares(e)[id] ?? e.points}</span>{/if}
      </div>
    {:else}
      <p class="sub">Heute noch nichts.</p>
    {/each}
  </div>
  <p class="f">Aktionen</p>
  <div class="quick">
    <button class="btn ok" onclick={() => act('bonus')}><Icon name="star" size={16} />Belohnung</button>
    <button class="btn bad" onclick={() => act('warn')}><Icon name="triangle-alert" size={16} />Abmahnung</button>
    <button class="btn info" onclick={() => act('frei')}><Icon name="tree-palm" size={16} />Frei geben</button>
    <button class="btn" onclick={() => act('assign')}><Icon name="clipboard-list" size={16} />Zuweisen</button>
    <button class="btn sec" onclick={() => open(Points, { member: m })}><Icon name="history" size={16} />Alle Punkte</button>
    <button class="btn sec" onclick={() => open(MemberEdit, { member: m })}><Icon name="pencil" size={16} />Bearbeiten</button>
  </div>
  {#if m.has_pin}<button class="link" style="margin-top:10px" onclick={resetPin}><Icon name="key-round" size={14} />PIN zurücksetzen</button>{/if}
{/if}
