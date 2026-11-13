<script>
  // Aufgabe anlegen oder ändern (Admins). Alle anderen schlagen damit eine neue Aufgabe vor.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, put, del } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  import { allRooms, roomOf, ROOM_ICONS } from '../lib/rooms.js';
  import { FREQ, DAYS, ptsOf } from '../../../shared/logic.js';
  let { task = null, close } = $props();
  // svelte-ignore state_referenced_locally
  const admin = G.admin, isNew = !task;
  // svelte-ignore state_referenced_locally
  let f = $state({ title: '', room: 'Wohnzimmer', freq: 'daily', day: 1, minutes: 5, leicht: false, per_person: false, active: true, ...(task || {}), points: task ? ptsOf(task) : 2 });
  let newRoom = $state(false), roomName = $state(''), roomIcon = $state('house');
  const rooms = $derived(allRooms(S.tasks, S.settings));

  async function save() {
    if (!f.title.trim()) return toast('Was ist zu tun?');
    const room = newRoom ? roomName.trim() : f.room;
    if (!room) return toast('Wie heißt der Bereich?');
    const ok = await tryDo(async () => {
      if (newRoom && admin) await put('/settings', { rooms: { ...S.settings.rooms, [room]: roomIcon } });
      await put('/tasks/' + (task?.id || crypto.randomUUID()), { ...f, room, day: f.freq === 'weekly' || f.freq === 'monthly' ? f.day : 0 });
    });
    if (ok) { toast(admin ? 'Gespeichert' : 'Vorschlag ist raus. Danke!'); close(); }
  }
  async function remove() {
    if (confirm('Aufgabe löschen? Alte Einträge und Fotos bleiben erhalten.') && (await tryDo(() => del('/tasks/' + task.id)))) close();
  }
</script>

<Head title={isNew ? (admin ? 'Neue Aufgabe' : 'Aufgabe vorschlagen') : 'Aufgabe bearbeiten'} {close} />
{#if !admin}<p class="sub">Dein Vorschlag geht an die Admins. Sobald er angenommen ist, taucht er bei allen auf.</p>{/if}
<label class="f" for="t-title">Aufgabe</label>
<input id="t-title" class="inp" bind:value={f.title} maxlength="120" placeholder="Was ist zu tun?" />

<label class="f" for="t-room">Bereich</label>
{#if newRoom}
  <div class="row">
    <input class="inp" bind:value={roomName} maxlength="40" placeholder="z. B. Keller, Balkon, Gartenhaus" />
    <button class="icb" onclick={() => (newRoom = false)} aria-label="Doch nicht"><Icon name="x" size={16} /></button>
  </div>
  {#if admin}
    <div class="pick" style="margin-top:8px">
      {#each ROOM_ICONS as i (i)}<button class:on={roomIcon === i} onclick={() => (roomIcon = i)} aria-label={i}><Icon name={i} /></button>{/each}
    </div>
  {/if}
{:else}
  <div class="row">
    <select id="t-room" class="inp" bind:value={f.room}>{#each rooms as r (r)}<option>{r}</option>{/each}</select>
    <button class="btn sec sm" onclick={() => (newRoom = true)}><Icon name="plus" size={16} />Neu</button>
  </div>
{/if}

<label class="f" for="t-freq">Wie oft?</label>
<select id="t-freq" class="inp" bind:value={f.freq}>{#each Object.entries(FREQ) as [k, v] (k)}<option value={k}>{v}</option>{/each}</select>
{#if f.freq === 'weekly'}
  <label class="f" for="t-day">An welchem Tag?</label>
  <select id="t-day" class="inp" bind:value={f.day}>{#each [1, 2, 3, 4, 5, 6, 7] as i (i)}<option value={i}>{DAYS[i]}</option>{/each}</select>
{:else if f.freq === 'monthly'}
  <label class="f" for="t-day">Ab welchem Tag im Monat? (1 bis 28)</label>
  <input id="t-day" class="inp" type="number" min="1" max="28" bind:value={f.day} />
{/if}

<div class="row" style="gap:12px">
  <div class="grow"><label class="f" for="t-pts">Punkte</label><input id="t-pts" class="inp" type="number" min="1" max="30" bind:value={f.points} /></div>
  <div class="grow"><label class="f" for="t-min">Dauer (Minuten)</label><input id="t-min" class="inp" type="number" min="1" max="240" bind:value={f.minutes} /></div>
</div>
<p class="hint" style="margin-top:6px">Punkte nach Anstrengung und Ekel-Faktor, nicht nur nach Zeit.</p>
<label class="chk"><input type="checkbox" bind:checked={f.leicht} />Leicht, können auch Kinder</label>
<label class="chk"><input type="checkbox" bind:checked={f.per_person} />Jeder macht das für sich (z. B. eigenes Zimmer)</label>
{#if admin}<label class="chk"><input type="checkbox" bind:checked={f.active} />Aktiv</label>{/if}

<div class="quick" style="margin-top:6px">
  {#if !isNew && admin}<button class="btn sec" onclick={remove}><Icon name="trash-2" size={16} />Löschen</button>{/if}
  <button class="btn" onclick={save}>{admin ? 'Speichern' : 'Vorschlagen'}</button>
</div>
