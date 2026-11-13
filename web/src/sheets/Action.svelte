<script>
  // Ein Dialog für die schnellen Admin-Aktionen: belohnen, abmahnen, frei geben, zuweisen, Durchsage.
  import Head from '../parts/Head.svelte';
  import { G, post, mName } from '../lib/store.svelte.js';
  import { toast, rain, tryDo } from '../lib/ui.svelte.js';
  let { kind, member = null, task = null, close } = $props();
  // svelte-ignore state_referenced_locally
  const K = {
    bonus: { title: 'Belohnung geben', btn: 'ok', pts: 5, label: 'Warum?', ph: 'z. B. Ohne Meckern die Küche gerettet', go: 'Belohnen' },
    warn: { title: 'Abmahnung', btn: 'bad', pts: 3, label: 'Warum?', ph: 'z. B. Töpfe wieder stehen gelassen', go: 'Abmahnen' },
    frei: { title: 'Frei geben', btn: 'info', when: true, label: 'Warum? (optional)', ph: 'z. B. Hat gestern die ganze Küche alleine gemacht', go: 'Frei geben' },
    assign: { title: 'Aufgabe zuweisen', btn: '', pts: 3, label: 'Aufgabe', ph: 'Was ist zu tun?', go: 'Zuweisen' },
    durchsage: { title: 'Durchsage an alle', btn: '', all: true, label: 'Nachricht', ph: 'z. B. Um 17 Uhr kommt Besuch, bitte Wohnzimmer!', go: 'Senden' },
  }[kind];
  // svelte-ignore state_referenced_locally
  let who = $state(member), when = $state(0), pts = $state(K.pts || 0), text = $state('');

  async function go() {
    if (!K.all && !who) return toast('Für wen?');
    if (!text.trim() && kind !== 'frei' && !task) return toast(kind === 'assign' ? 'Was ist zu tun?' : kind === 'durchsage' ? 'Die Nachricht ist leer' : 'Bitte einen Grund angeben');
    const ok = await tryDo(() => {
      if (kind === 'durchsage') return post('/announce', { text });
      if (kind === 'assign') return task ? post(`/tasks/${task.id}/assign`, { member_id: who }) : post('/entries/adhoc', { kind: 'assign', member_id: who, title: text, points: pts });
      return post('/entries/reward', { kind, member_id: who, points: pts, reason: text, when });
    });
    if (!ok) return;
    if (kind === 'bonus') rain('⭐🌟🏆💖');
    toast({ bonus: `${mName(who)} bekommt +${pts} Punkte`, warn: `Abmahnung an ${mName(who)} (−${pts} P)`, frei: `${mName(who)} hat ${['heute', 'morgen', 'übermorgen'][when]} frei`, assign: `${mName(who)} hat es jetzt auf der Liste`, durchsage: 'Durchsage ist raus' }[kind]);
    close(true);
  }
</script>

<Head title={K.title} {close} />
{#if K.all}
  <p class="sub">Geht als Benachrichtigung an alle Handys und erscheint sofort in offenen Apps.</p>
{:else}
  <p class="f">Für wen?</p>
  <div class="pick">{#each G.active as m (m.id)}<button class:on={who === m.id} onclick={() => (who = m.id)}>{m.emoji} {m.name}</button>{/each}</div>
{/if}
{#if K.when}
  <p class="f">Wann?</p>
  <div class="pick">{#each ['Heute', 'Morgen', 'Übermorgen'] as w, i (w)}<button class:on={when === i} onclick={() => (when = i)}>{w}</button>{/each}</div>
  <p class="hint">An dem Tag ist das Tagesziel automatisch geschafft, die Serie bleibt.</p>
{/if}
{#if task}
  <p class="f">Aufgabe</p>
  <p><b>{task.title}</b></p>
  <p class="hint" style="margin-top:0">Steht danach bei der Person unter „Meins“ und ist für die anderen vergeben.</p>
{:else}
  {#if K.pts}
    <p class="f">Punkte</p>
    <div class="step">
      <button class="btn sec sm" onclick={() => (pts = Math.max(1, pts - 1))} aria-label="weniger">−</button>
      <b>{kind === 'warn' ? '−' : '+'}{pts}</b>
      <button class="btn sec sm" onclick={() => (pts = Math.min(kind === 'assign' ? 30 : 50, pts + 1))} aria-label="mehr">+</button>
    </div>
  {/if}
  <label class="f" for="a-text">{K.label}</label>
  <input id="a-text" class="inp" bind:value={text} maxlength="160" placeholder={K.ph} onkeydown={e => e.key === 'Enter' && go()} />
{/if}
<button class="btn wide {K.btn}" style="margin-top:16px" onclick={go}>{K.go}</button>
