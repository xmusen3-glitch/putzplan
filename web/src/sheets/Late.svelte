<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, G } from '../lib/store.svelte.js';
  import { open } from '../lib/ui.svelte.js';
  import { roomOf } from '../lib/rooms.js';
  import { lateLabel, ptsOf } from '../../../shared/logic.js';
  import Action from './Action.svelte';
  let { close } = $props();
</script>

<Head title="Liegengeblieben" {close} />
<div class="list">
  {#each G.late as t (t.id)}
    {@const r = roomOf(t.room, S.settings)}
    <div class="row">
      <span class="tile" style="--c:{r.color}"><Icon name={r.icon} /></span>
      <div class="grow"><b>{t.title}</b><small>{t.room} · <span class="late">{lateLabel(t)}</span> · +{ptsOf(t)} P</small></div>
      <button class="btn sm" onclick={() => open(Action, { kind: 'assign', task: t })}>Zuweisen</button>
    </div>
  {:else}
    <p class="empty">Nichts liegengeblieben.</p>
  {/each}
</div>
<p class="hint">Zuweisen schickt der Person eine Benachrichtigung. Die Aufgabe steht dann bei ihr unter „Meins“.</p>
