<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G, post, mName } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  let { close } = $props();
  let mode = $state('extra'), title = $state(''), cook = $state(S.meId);

  async function go() {
    if (mode === 'extra') {
      if (!title.trim()) return;
      if (await tryDo(() => post('/entries/adhoc', { kind: 'extra', title }))) { toast('Steht unter „Meins“. Start mit Vorher-Foto!'); close(); }
    } else if (await tryDo(() => post('/entries/adhoc', { kind: 'koch', member_id: cook }))) {
      toast(cook === S.meId ? 'Steht auf deiner Liste.' : `${mName(cook)} hat es jetzt auf der Liste.`); close();
    }
  }
</script>

<Head title="Extra-Aufgabe" {close} />
{#if S.settings.koch_regel}
  <div class="seg">
    <button class:on={mode === 'extra'} onclick={() => (mode = 'extra')}><Icon name="sparkles" size={16} /> Dreck gesehen</button>
    <button class:on={mode === 'koch'} onclick={() => (mode = 'koch')}><Icon name="cooking-pot" size={16} /> Es wurde gekocht</button>
  </div>
{/if}
{#if mode === 'extra'}
  <p class="sub">Irgendwo Dreck gesehen? Vorher- und Nachher-Foto machen und 2 Extra-Punkte kassieren.</p>
  <label class="f" for="x-title">Was machst du weg?</label>
  <!-- svelte-ignore a11y_autofocus -->
  <input id="x-title" class="inp" bind:value={title} maxlength="120" autofocus placeholder="z. B. Fleck an der Küchentür wischen" onkeydown={e => e.key === 'Enter' && go()} />
{:else}
  <p class="sub">Wer kocht, räumt auf: Diese Person bekommt „Töpfe, Pfannen & Herd sauber machen“ (+3 Punkte).</p>
  <p class="f">Gekocht hat:</p>
  <div class="pick">
    {#each G.active as m (m.id)}<button class:on={cook === m.id} onclick={() => (cook = m.id)}>{m.emoji} {m.name}</button>{/each}
  </div>
{/if}
<button class="btn wide" style="margin-top:16px" onclick={go}>{mode === 'extra' ? 'Auf meine Liste' : 'Aufgabe eintragen'}</button>
