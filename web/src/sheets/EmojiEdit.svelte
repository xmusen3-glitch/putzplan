<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { G, post } from '../lib/store.svelte.js';
  import { toast, rain as letItRain, graphemes, tryDo } from '../lib/ui.svelte.js';
  import { DEFAULT_RAIN } from '../../../shared/logic.js';
  let { close } = $props();
  const CHOICES = graphemes('😀😎🤩🥳😇🤪🦄🦖🐱🐶🦊🐼🐸🐵🦁🐯🐰🐻🐨🦋🌸🌻🌈⭐🔥💎👑💪🎸⚽🏀🎮🍕🍩🍓🧁🚀🛸🧽🧹✨🎉💖🍀🌊🏆🎯🧸🎀');
  let emoji = $state(G.me.emoji), rain = $state(G.me.rain || DEFAULT_RAIN), target = $state('emoji');

  function pick(e) {
    if (target === 'emoji') return void (emoji = e);
    const cur = graphemes(rain);
    rain = cur.includes(e) ? cur.filter(x => x !== e).join('') : [...cur, e].slice(-8).join('');
  }
  async function save() {
    if (await tryDo(() => post('/me', { emoji, rain }))) { letItRain(rain); toast('Gespeichert. Sieht super aus!'); close(); }
  }
</script>

<Head title="Mein Emoji & Emoji-Regen" {close} />
<div class="seg">
  <button class:on={target === 'emoji'} onclick={() => (target = 'emoji')}>Mein Emoji {emoji}</button>
  <button class:on={target === 'rain'} onclick={() => (target = 'rain')}>Mein Regen</button>
</div>
{#if target === 'rain'}
  <input class="inp" bind:value={rain} maxlength="40" placeholder="Emojis oder ein kurzer Text" />
  <p class="hint" style="margin:6px 0 0">Das regnet, wenn du eine Aufgabe schaffst. Unten antippen oder selbst eintippen.</p>
{:else}
  <input class="inp" bind:value={emoji} maxlength="8" placeholder="Eigenes Emoji eintippen" />
{/if}
<div class="emojis">
  {#each CHOICES as e (e)}<button class:on={target === 'emoji' ? emoji === e : graphemes(rain).includes(e)} onclick={() => pick(e)}>{e}</button>{/each}
</div>
<div class="quick">
  <button class="btn sec" onclick={() => letItRain(rain)}><Icon name="cloud-rain" size={16} />Test-Regen</button>
  <button class="btn" onclick={save}>Speichern</button>
</div>
