<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, put, del } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  import { DAYS, ROLES } from '../../../shared/logic.js';
  let { member = null, close } = $props();
  // svelte-ignore state_referenced_locally
  const isNew = !member;
  // svelte-ignore state_referenced_locally
  let f = $state({ name: '', emoji: '🙂', role: 'mitglied', w_weekday: 1, w_weekend: 1, waschtag: null, titel: null, active: true, away_from: null, away_to: null, ...(member || {}) });
  // svelte-ignore state_referenced_locally
  let away = $state(!!(member?.away_from && member?.away_to));
  const LOADS = [[0, 'keine Aufgaben'], [0.25, 'ganz wenig'], [0.5, 'etwas weniger'], [0.6, 'etwas weniger (Kind)'], [0.75, 'fast normal'], [1, 'normal'], [1.25, 'etwas mehr'], [1.5, 'mehr'], [1.6, 'mehr (Wochenende)'], [2, 'viel mehr']];
  const loads = v => (LOADS.some(([x]) => x === +v) ? LOADS : [...LOADS, [+v, `eigener Wert (${v})`]].sort((a, b) => a[0] - b[0]));

  async function save() {
    if (!f.name.trim()) return toast('Der Name fehlt');
    if (away && (!f.away_from || !f.away_to || f.away_to < f.away_from)) return toast('Bitte Von und Bis für die Abwesenheit eintragen');
    const body = { ...f, away_from: away ? f.away_from : null, away_to: away ? f.away_to : null };
    if (await tryDo(() => put('/members/' + (member?.id || crypto.randomUUID()), body))) { toast('Gespeichert'); close(); }
  }
  async function remove() {
    if (confirm(`${f.name} wirklich entfernen? Die alten Einträge bleiben erhalten.`) && (await tryDo(() => del('/members/' + member.id)))) close();
  }
</script>

<Head title={isNew ? 'Neue Person' : `${f.emoji} ${f.name}`} {close} />
<div class="row" style="gap:12px">
  <div style="width:84px"><label class="f" for="m-emoji">Emoji</label><input id="m-emoji" class="inp" bind:value={f.emoji} maxlength="8" /></div>
  <div class="grow"><label class="f" for="m-name">Name</label><input id="m-name" class="inp" bind:value={f.name} maxlength="30" /></div>
</div>
<label class="f" for="m-role">Rolle</label>
<select id="m-role" class="inp" bind:value={f.role}>{#each Object.entries(ROLES) as [k, v] (k)}<option value={k}>{v}</option>{/each}</select>
<p class="hint" style="margin-top:6px">{f.role === 'admin' ? 'Sieht alles, prüft Fotos, ändert Aufgaben und Regeln.' : f.role === 'kind' ? 'Bekommt nur leichte eigene Aufgaben, bei allem anderen steht „mit Hilfe“.' : 'Macht mit, kann Aufgaben vorschlagen.'}</p>
<div class="row" style="gap:12px">
  <div class="grow"><label class="f" for="m-wd">Pensum Mo–Fr</label><select id="m-wd" class="inp" bind:value={f.w_weekday}>{#each loads(f.w_weekday) as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></div>
  <div class="grow"><label class="f" for="m-we">Pensum Wochenende</label><select id="m-we" class="inp" bind:value={f.w_weekend}>{#each loads(f.w_weekend) as [v, l] (v)}<option value={v}>{l}</option>{/each}</select></div>
</div>
<div class="row" style="gap:12px">
  <div class="grow"><label class="f" for="m-wt">Waschtag</label><select id="m-wt" class="inp" bind:value={f.waschtag}><option value={null}>kein Waschtag</option>{#each [1, 2, 3, 4, 5, 6, 7] as i (i)}<option value={i}>{DAYS[i]}</option>{/each}</select></div>
  <div class="grow"><label class="f" for="m-titel">Titel als Wochensieger</label><select id="m-titel" class="inp" bind:value={f.titel}><option value={null}>Majestät</option><option value="k">König</option><option value="q">Königin</option></select></div>
</div>
<label class="chk"><input type="checkbox" bind:checked={away} />Abwesend (Urlaub, krank) mit Zeitraum</label>
{#if away}
  <div class="row" style="gap:12px">
    <div class="grow"><label class="f" for="m-from" style="margin-top:0">Von</label><input id="m-from" class="inp" type="date" bind:value={f.away_from} /></div>
    <div class="grow"><label class="f" for="m-to" style="margin-top:0">Bis</label><input id="m-to" class="inp" type="date" bind:value={f.away_to} /></div>
  </div>
  <p class="hint" style="margin-top:6px">In der Zeit gibt es kein Tagesziel und keine Erinnerungen, die Serie bleibt erhalten.</p>
{/if}
<label class="chk"><input type="checkbox" bind:checked={f.active} />Macht mit (aus = ganz pausiert, kann sich nicht anmelden)</label>

<div class="quick" style="margin-top:6px">
  {#if !isNew && member.id !== S.meId}<button class="btn sec" onclick={remove}><Icon name="trash-2" size={16} />Entfernen</button>{/if}
  <button class="btn" onclick={save}>Speichern</button>
</div>
