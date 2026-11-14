<script>
  // Erscheint beim Öffnen, solange Benachrichtigungen auf diesem Gerät aus sind.
  // Die eigentliche Frage des Handys darf erst nach einem Tipp kommen, deshalb der Knopf.
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { enablePush } from '../lib/push.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  let { kind, close } = $props();
  let busy = $state(false);
  async function on() {
    busy = true;
    const ok = await tryDo(enablePush);
    if (ok) toast('Benachrichtigungen sind an. Gleich kommt eine Test-Nachricht.');
    close(ok ? 'an' : undefined);
  }
</script>

<Head title={kind === 'frage' ? 'Benachrichtigungen einschalten?' : 'Benachrichtigungen sind aus'} {close} />
{#if kind === 'frage'}
  <p class="sub">Dann meldet sich der Putzplan von selbst: bei einer neuen Aufgabe für dich, am Waschtag, wenn dein Tagesziel noch offen ist, bei Reaktionen auf deine Fotos und bei Belohnungen.</p>
  <button class="btn wide" style="margin-top:14px" onclick={on} disabled={busy}><Icon name="bell" size={18} />Einschalten</button>
  <p class="hint">Dein Gerät fragt gleich noch einmal nach. Dort „Erlauben“ antippen.</p>
{:else if kind === 'ios'}
  <p class="sub">Auf dem iPhone gehen Benachrichtigungen nur, wenn der Putzplan als App auf dem Home-Bildschirm liegt:</p>
  <ol class="steps">
    <li>Unten auf den Teilen-Knopf tippen</li>
    <li>„Zum Home-Bildschirm“ wählen</li>
    <li>Den Putzplan von dort öffnen und einschalten</li>
  </ol>
  <button class="btn wide" onclick={() => close()}>Verstanden</button>
{:else}
  <p class="sub">Auf diesem Gerät sind Benachrichtigungen für den Putzplan gesperrt. Erlaube sie in den Einstellungen des Handys (Apps oder Browser, dann Benachrichtigungen) oder am PC über das Symbol links neben der Adresse. Danach unter „Ich“ auf „Benachrichtigungen“ tippen.</p>
  <button class="btn wide" style="margin-top:14px" onclick={() => close()}>Verstanden</button>
{/if}
<div class="row" style="justify-content:space-between;margin-top:6px">
  {#if kind === 'frage'}<button class="link" onclick={() => close()}>Später</button>{/if}
  <button class="link" onclick={() => close('nie')}>Auf diesem Gerät nicht mehr fragen</button>
</div>

<style>
  .steps { margin: 10px 0 14px; padding-left: 22px; font-weight: 700; }
  .steps li { padding: 3px 0; }
</style>
