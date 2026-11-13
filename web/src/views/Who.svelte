<script>
  // Person antippen, PIN eingeben. Ohne PIN wird beim ersten Mal eine festgelegt. Geprüft wird am Server.
  import Icon from '../parts/Icon.svelte';
  import { S, login, leave } from '../lib/store.svelte.js';
  import { toast } from '../lib/ui.svelte.js';
  let who = $state.raw(null), pin = $state(''), first = $state(''), busy = $state(false), shake = $state(false);
  let msg = $state('');
  const fresh = $derived(who && !who.has_pin);

  function pick(m) { who = m; pin = ''; first = ''; msg = m.has_pin ? 'Deine PIN bitte' : 'Leg deine geheime 4-stellige PIN fest'; }
  async function press(k) {
    if (busy) return;
    pin = k === 'del' ? pin.slice(0, -1) : pin.length < 4 ? pin + k : pin;
    if (pin.length < 4) return;
    if (fresh && !first) { first = pin; pin = ''; msg = 'Nochmal zur Sicherheit'; return; }
    if (fresh && first !== pin) { first = ''; pin = ''; msg = 'Stimmt nicht überein. Nochmal von vorn:'; return; }
    busy = true;
    try { await login(who.id, pin); toast(`Hallo ${who.name}! ${who.emoji}`); }
    catch (e) { msg = e.message; pin = ''; first = ''; shake = true; setTimeout(() => (shake = false), 300); }
    busy = false;
  }
  function key(e) {
    if (!who) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  }
</script>

<svelte:window onkeydown={key} />
<div class="gate">
  {#if !who}
    <img class="logo" src="/icon-192.png" alt="" />
    <h1>Wer bist du?</h1>
    <p class="sub">Tipp auf deinen Namen</p>
    <div class="whos">
      {#each S.picker as m (m.id)}<button onclick={() => pick(m)}><span>{m.emoji}</span>{m.name}</button>{/each}
    </div>
    {#if !S.picker.length}<p class="sub" style="margin-top:16px">Noch niemand angelegt.</p>{/if}
    <button class="link" style="margin-top:24px" onclick={() => confirm('Dieses Gerät vom Putzplan abmelden?') && leave()}><Icon name="log-out" size={14} />Gerät abmelden</button>
  {:else}
    <div class="ava xl" style="margin:10px auto">{who.emoji}</div>
    <h1>{who.name}</h1>
    <p class="sub" style="margin-top:6px">{msg}</p>
    <div class="pin" style={shake ? 'transform:translateX(8px)' : ''}>{#each [0, 1, 2, 3] as i (i)}<span class:f={i < pin.length}></span>{/each}</div>
    <div class="pad">
      {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as k (k)}<button onclick={() => press(k)}>{k}</button>{/each}
      <span></span>
      <button onclick={() => press('0')}>0</button>
      <button onclick={() => press('del')} aria-label="Löschen"><Icon name="delete" size={24} /></button>
    </div>
    <button class="link" style="margin-top:20px" onclick={() => (who = null)}><Icon name="arrow-left" size={14} />Zurück</button>
  {/if}
</div>
