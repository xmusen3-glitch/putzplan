<script>
  // Reaktionen erscheinen sofort (ohne auf den Server zu warten), Kommentare sind eingeklappt.
  import Icon from './Icon.svelte';
  import { S, G, reactionsOf, mName, post, del } from '../lib/store.svelte.js';
  import { rain, toast, tryDo } from '../lib/ui.svelte.js';
  import { REACTS } from '../../../shared/logic.js';
  let { entry } = $props();
  let picking = $state(false), showComments = $state(false), text = $state('');
  const all = $derived(reactionsOf(entry.id));
  const comments = $derived(all.filter(r => r.text).sort((a, b) => a.created_at.localeCompare(b.created_at)));
  const groups = $derived(REACTS.map(e => ({ e, who: all.filter(r => r.emoji === e) })).filter(g => g.who.length));

  function react(emoji) {
    picking = false;
    const mine = all.find(r => r.emoji === emoji && r.member_id === S.meId);
    if (mine) {
      S.reactions = S.reactions.filter(r => r.id !== mine.id);
      post('/reactions', { entry_id: entry.id, emoji, on: false }).catch(e => { S.reactions = [...S.reactions, mine]; toast(e.message); });
    } else {
      const r = { id: crypto.randomUUID(), entry_id: entry.id, member_id: S.meId, emoji, text: null, created_at: new Date().toISOString() };
      S.reactions = [...S.reactions, r];
      rain(emoji.repeat(3));
      post('/reactions', { id: r.id, entry_id: entry.id, emoji, on: true }).catch(e => { S.reactions = S.reactions.filter(x => x.id !== r.id); toast(e.message); });
    }
  }
  async function send() {
    const t = text.trim();
    if (!t) return;
    text = '';
    if (!(await tryDo(() => post('/reactions', { id: crypto.randomUUID(), entry_id: entry.id, text: t })))) text = t;
  }
</script>

<div class="reacts">
  {#if picking}
    {#each REACTS as e (e)}
      <button class="rc" class:on={all.some(r => r.emoji === e && r.member_id === S.meId)} onclick={() => react(e)}>{e}</button>
    {/each}
    <button class="rc ghost" onclick={() => (picking = false)} aria-label="Schließen"><Icon name="x" size={14} /></button>
  {:else}
    {#each groups as g (g.e)}
      <button class="rc" class:on={g.who.some(r => r.member_id === S.meId)} onclick={() => react(g.e)} title={g.who.map(r => mName(r.member_id)).join(', ')}>{g.e} {g.who.length}</button>
    {/each}
    <button class="rc ghost" onclick={() => (picking = true)} aria-label="Reagieren"><Icon name="smile-plus" size={16} /></button>
    <button class="rc ghost" onclick={() => (showComments = !showComments)} aria-label="Kommentare"><Icon name="message-circle" size={16} />{comments.length || ''}</button>
  {/if}
</div>
{#if showComments}
  <div class="cmts">
    {#each comments as c (c.id)}
      <p>
        <b>{mName(c.member_id)}:</b> {c.text}
        {#if c.member_id === S.meId || G.admin}<button class="link" onclick={() => tryDo(() => del('/reactions/' + c.id))} aria-label="Kommentar löschen"><Icon name="x" size={12} /></button>{/if}
      </p>
    {/each}
    <div class="row" style="margin-top:6px">
      <input class="inp" bind:value={text} maxlength="300" placeholder="Kommentar schreiben" onkeydown={e => e.key === 'Enter' && send()} />
      <button class="btn sec sm" onclick={send} aria-label="Senden"><Icon name="send" size={16} /></button>
    </div>
  </div>
{/if}
