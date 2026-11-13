<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { api, post } from '../lib/store.svelte.js';
  import { toast, tryDo } from '../lib/ui.svelte.js';
  let { close } = $props();
  let link = $state(''), qr = $state('');

  async function show(code) {
    link = `${location.origin}/#join=${code}`;
    const { default: qrcode } = await import('qrcode-generator');
    const q = qrcode(0, 'L');
    q.addData(link); q.make();
    qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  tryDo(async () => show((await api('GET', '/invite')).code));
  const share = () => navigator.share({ title: 'Unser Putzplan', text: 'Hier ist unser Familien-Putzplan. Öffnen, Namen antippen, PIN festlegen.', url: link }).catch(() => {});
  const copy = () => navigator.clipboard.writeText(link).then(() => toast('Link kopiert'), () => prompt('Link kopieren:', link));
  async function renew() {
    if (!confirm('Neuen Link erzeugen? Der alte Link funktioniert dann nicht mehr. Wer schon drin ist, bleibt drin.')) return;
    await tryDo(async () => { await show((await post('/invite/renew')).code); toast('Neuer Link ist da.'); });
  }
</script>

<Head title="Familie einladen" {close} />
<p class="sub">QR-Code mit dem Handy scannen oder den Link verschicken. Wer ihn öffnet, tippt seinen Namen an und legt eine PIN fest. Bitte nur an die Familie geben.</p>
{#if qr}<div class="qr">{@html qr}</div>{/if}
<div class="quick">
  {#if navigator.share}<button class="btn" onclick={share}><Icon name="share-2" size={16} />Link teilen</button>{/if}
  <button class="btn sec" onclick={copy}><Icon name="copy" size={16} />Link kopieren</button>
</div>
<button class="link" style="margin-top:10px" onclick={renew}><Icon name="refresh-cw" size={14} />Neuen Link erzeugen (alter wird ungültig)</button>

<style>
  .qr { background: #fff; padding: 12px; border-radius: 14px; width: 240px; margin: 14px auto; }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
</style>
