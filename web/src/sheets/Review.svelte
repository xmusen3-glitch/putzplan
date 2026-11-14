<script>
  // Fotos prüfen: alle neuen nacheinander, oder (mit "only") genau einen Eintrag.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import Pair from '../parts/Pair.svelte';
  import { S, G, mem, mName, post } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  let { only = null, close } = $props();
  let note = $state(''), asking = $state(false), busy = $state(false);
  const cur = $derived(only ? [...S.entries, ...S.older].find(e => e.id === only && e.status === 'done') : G.queue[0]);
  const time = iso => new Date(iso).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  async function verdict(v) {
    if (busy) return;
    busy = true;
    const ok = await tryDo(() => post(`/entries/${cur.id}/review`, { verdict: v, note }));
    busy = false; note = ''; asking = false;
    if (ok && only) close();
  }
  async function allOk() {
    if (!confirm(`Alle ${G.queue.length} als „Passt“ markieren?`)) return;
    if (await tryDo(() => post('/entries/review-all'))) { toast('Alles geprüft.'); close(); }
  }
</script>

{#if cur}
  <Head title={only && cur.review ? 'Urteil ändern' : 'Fotos prüfen'} {close}>
    {#if !only}<span class="chip c-brand">{G.queue.length} offen</span>{/if}
  </Head>
  <div class="row">
    <span class="ava sm">{mem(cur.member_id)?.emoji || '🙂'}</span>
    <div class="grow"><b>{cur.title}</b><small>{mName(cur.member_id)}{cur.helpers.length ? ' mit ' + cur.helpers.map(mName).join(', ') : ''} · {time(cur.after_at)} · +{cur.points} P</small></div>
    {#if cur.review === 'ok'}<span class="chip c-ok"><Icon name="check" size={14} />Geprüft</span>{:else if cur.review === 'nach'}<span class="chip c-warn">Nachbessern</span>{/if}
  </div>
  <Pair entry={cur} />
  {#if asking}
    <label class="f" for="rv-note">Was soll besser werden? (optional)</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input id="rv-note" class="inp" bind:value={note} maxlength="200" autofocus placeholder="z. B. Unter dem Tisch bitte nochmal" onkeydown={e => e.key === 'Enter' && verdict('nach')} />
    <div class="quick" style="margin-top:10px">
      <button class="btn sec" onclick={() => (asking = false)}>Zurück</button>
      <button class="btn warn" onclick={() => verdict('nach')}><Icon name="rotate-ccw" size={16} />Zurückgeben</button>
    </div>
  {:else}
    <div class="btns3">
      <button class="btn ok" disabled={busy} onclick={() => verdict('ok')}><Icon name="check" size={16} />Passt</button>
      <button class="btn warn" disabled={busy} onclick={() => (asking = true)}><Icon name="rotate-ccw" size={16} />Nochmal</button>
      <button class="btn bad" disabled={busy} onclick={() => confirm(`Ablehnen? ${mName(cur.member_id)} verliert die Punkte und die Aufgabe ist wieder offen.`) && verdict('reject')}><Icon name="x" size={16} />Ablehnen</button>
    </div>
    <p class="hint">Nochmal: geht mit Hinweis zurück, die Punkte bleiben erst mal stehen. Ablehnen: Punkte weg, Aufgabe wieder offen.</p>
    {#if !only && G.queue.length > 1}<button class="link" onclick={allOk}><Icon name="check-check" size={14} />Alle {G.queue.length} passen</button>{/if}
  {/if}
{:else}
  <Head title="Fotos prüfen" {close} />
  <div class="empty">
    <span class="tile c-ok" style="width:72px;height:72px;margin:0 auto 10px;border-radius:22px"><Icon name="circle-check" size={44} /></span>
    <p><b>Alles geprüft</b></p>
    <p class="sub">Keine neuen Fotos.</p>
    <button class="btn" style="margin-top:12px" onclick={() => close()}>Fertig</button>
  </div>
{/if}
