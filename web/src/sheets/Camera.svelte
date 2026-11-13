<script>
  // Kamera nur live, keine Galerie. Liefert das Foto und ein kleines Vorschaubild.
  import { onDestroy } from 'svelte';
  import Icon from '../parts/Icon.svelte';
  import { G } from '../lib/store.svelte.js';
  import { toast } from '../lib/ui.svelte.js';
  let { label, kind = 'before', close } = $props();
  let video = $state(), stream = $state.raw(null), error = $state(''), shot = $state.raw(null);
  let facing = 'environment';
  const dev = import.meta.env.DEV;
  const two = n => String(n).padStart(2, '0');

  async function start() {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) return void (error = 'Dieser Browser kann keine Kamera in Apps öffnen. Bitte die App in Chrome oder Safari öffnen.');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }); error = ''; }
    catch { error = 'Ich komme nicht an die Kamera. Bitte erlaube den Kamera-Zugriff für diese App und versuch es nochmal. Fotos aus der Galerie gehen absichtlich nicht.'; }
  }
  function stop() { stream?.getTracks().forEach(t => t.stop()); stream = null; }
  $effect(() => { if (video && stream) { video.srcObject = stream; video.play().catch(() => {}); } });
  start();
  onDestroy(stop);

  function canvas(source, sw, sh, max) {
    const sc = Math.min(1, max / Math.max(sw, sh)), cv = document.createElement('canvas');
    cv.width = Math.round(sw * sc); cv.height = Math.round(sh * sc);
    cv.getContext('2d').drawImage(source, 0, 0, cv.width, cv.height);
    return cv;
  }
  function take(source, sw, sh) {
    const cv = canvas(source, sw, sh, 1280), g = cv.getContext('2d'), d = new Date();
    const stamp = `${G.me?.name || ''} · ${kind === 'after' ? 'NACHHER' : 'VORHER'} · ${two(d.getDate())}.${two(d.getMonth() + 1)}. ${two(d.getHours())}:${two(d.getMinutes())}`;
    const fs = Math.max(14, Math.round(cv.width / 32));
    g.font = `bold ${fs}px system-ui,sans-serif`;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, cv.height - fs * 1.8, cv.width, fs * 1.8);
    g.fillStyle = '#fff'; g.fillText(stamp, fs * 0.6, cv.height - fs * 0.6);
    shot = { photo: cv.toDataURL('image/jpeg', 0.72), thumb: canvas(cv, cv.width, cv.height, 480).toDataURL('image/jpeg', 0.6) };
  }
  function snap() {
    if (!video?.videoWidth) return toast('Kamera lädt noch …');
    take(video, video.videoWidth, video.videoHeight);
  }
  function fake() { // nur in der Entwicklung: Testbild ohne Kamera
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 960;
    const g = cv.getContext('2d'), grad = g.createLinearGradient(0, 0, 1280, 960);
    grad.addColorStop(0, kind === 'after' ? '#23a86d' : '#6b6880'); grad.addColorStop(1, kind === 'after' ? '#7c5cff' : '#3d3a52');
    g.fillStyle = grad; g.fillRect(0, 0, 1280, 960);
    g.fillStyle = '#fff'; g.font = 'bold 64px system-ui'; g.fillText('Testbild', 80, 160);
    take(cv, 1280, 960);
  }
</script>

<div class="cam">
  <div class="cap"><span class="tag" class:after={kind === 'after'}>{kind === 'after' ? 'NACHHER-Foto' : 'VORHER-Foto'}</span><br />{label}</div>
  <div class="stage">
    {#if shot}
      <img src={shot.photo} alt="Aufnahme" />
    {:else if error}
      <div class="msg"><Icon name="camera-off" size={44} /><p>{error}</p></div>
    {:else}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} autoplay playsinline muted></video>
    {/if}
  </div>
  <div class="ctl">
    {#if shot}
      <button class="btn sec" onclick={() => (shot = null)}><Icon name="rotate-ccw" size={16} />Nochmal</button>
      <button class="btn ok" onclick={() => close(shot)}><Icon name="check" size={16} />Passt</button>
    {:else}
      <button class="btn sec" onclick={() => close()}>Abbrechen</button>
      {#if !error}
        <button class="shutter" aria-label="Foto machen" onclick={snap}></button>
        <button class="btn sec" onclick={() => { facing = facing === 'environment' ? 'user' : 'environment'; start(); }} aria-label="Kamera wechseln"><Icon name="switch-camera" /></button>
      {/if}
      {#if dev}<button class="btn sec" onclick={fake}>Testbild</button>{/if}
    {/if}
  </div>
</div>
