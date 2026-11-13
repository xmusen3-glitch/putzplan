<script>
  import Head from '../parts/Head.svelte';
  import { G, post } from '../lib/store.svelte.js';
  import { toast, rain, tryDo } from '../lib/ui.svelte.js';
  import * as L from '../../../shared/logic.js';
  let { close } = $props();
  const days = $derived.by(() => {
    const today = L.noon(G.calc.d), out = [];
    for (let i = 0; i < 7; i++) { const x = L.noon(today, -i); if (L.weekKey(x) !== L.weekKey(today)) break; out.push(x); }
    return out;
  });
  async function take(x) {
    const name = L.DAYS[L.isoDay(x)];
    if (!confirm(`${name} als freien Tag nehmen? Das geht nur einmal pro Woche.`)) return;
    if (await tryDo(() => post('/royal', { day: L.dKey(x) }))) { rain('👑🏰✨🎉'); toast(`${name} ist dein königlicher freier Tag!`); close(); }
  }
</script>

<Head title="Eure Majestät wählt" {close} />
<p class="sub">Such dir einen freien Tag in dieser Woche aus. An dem Tag ist dein Tagesziel automatisch geschafft.</p>
<div class="quick" style="margin-top:12px">
  {#each days as x (L.dKey(x))}<button class="btn sec" onclick={() => take(x)}>{L.DAYS[L.isoDay(x)]}</button>{/each}
</div>
