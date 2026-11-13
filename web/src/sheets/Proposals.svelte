<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { G, mName, mEmoji, post, del } from '../lib/store.svelte.js';
  import { open, toast, rain, tryDo } from '../lib/ui.svelte.js';
  import { FREQ, ptsOf } from '../../../shared/logic.js';
  import TaskEdit from './TaskEdit.svelte';
  let { close } = $props();
  async function accept(t) { if (await tryDo(() => post(`/tasks/${t.id}/active`, { active: true }))) { rain('💡✅🎉'); toast('Angenommen, ist jetzt im Plan'); } }
  const decline = t => confirm('Vorschlag ablehnen?') && tryDo(() => del('/tasks/' + t.id));
</script>

<Head title="Vorschläge" {close} />
<div class="list">
  {#each G.proposals as t (t.id)}
    <div class="row">
      <span class="ava sm">{mEmoji(t.proposed_by)}</span>
      <div class="grow"><b>{t.title}</b><small>von {mName(t.proposed_by)} · {t.room} · {FREQ[t.freq]} · {ptsOf(t)} P</small></div>
      <button class="icb" onclick={() => open(TaskEdit, { task: t })} aria-label="Bearbeiten"><Icon name="pencil" size={16} /></button>
      <button class="icb" onclick={() => decline(t)} aria-label="Ablehnen"><Icon name="x" size={16} /></button>
      <button class="btn ok sm" onclick={() => accept(t)} aria-label="Annehmen"><Icon name="check" size={16} /></button>
    </div>
  {:else}
    <p class="empty">Keine offenen Vorschläge.</p>
  {/each}
</div>
