<script>
  import { fly, fade } from 'svelte/transition';
  import Icon from './parts/Icon.svelte';
  import { S, G, mName } from './lib/store.svelte.js';
  import { ui, toast } from './lib/ui.svelte.js';
  import { ROLES } from '../../shared/logic.js';
  import Join from './views/Join.svelte';
  import Who from './views/Who.svelte';
  import Today from './views/Today.svelte';
  import Photos from './views/Photos.svelte';
  import Rank from './views/Rank.svelte';
  import Me from './views/Me.svelte';
  import Overview from './views/Overview.svelte';
  import Admin from './views/Admin.svelte';

  const NAV = [
    { id: 'uebersicht', icon: 'layout-dashboard', label: 'Übersicht', admin: true },
    { id: 'heute', icon: 'list-checks', label: 'Heute' },
    { id: 'fotos', icon: 'images', label: 'Fotos' },
    { id: 'rang', icon: 'trophy', label: 'Rangliste' },
    { id: 'ich', icon: 'user', label: 'Ich' },
    { id: 'verwaltung', icon: 'settings', label: 'Verwaltung', admin: true, desk: true },
  ];
  const VIEWS = { uebersicht: Overview, heute: Today, fotos: Photos, rang: Rank, ich: Me, verwaltung: Admin };
  const items = $derived(NAV.filter(n => !n.admin || G.admin));
  const View = $derived(VIEWS[items.some(n => n.id === S.tab) ? S.tab : 'heute']);
  const badge = $derived(G.admin ? G.queue.length + G.proposals.length + G.pinHelp.length : 0);
  const go = id => { S.tab = id; scrollTo(0, 0); };

  // Durchsagen kommen bei offenen Apps sofort als Meldung an
  $effect(() => { if (S.say && S.say.from !== S.meId) toast(`Durchsage von ${mName(S.say.from)}: ${S.say.text}`, 8000); });
</script>

{#if S.phase === 'boot'}
  <p class="empty" style="margin-top:40vh">Lädt …</p>
{:else if S.phase === 'join'}
  <Join />
{:else if S.phase === 'who'}
  <Who />
{:else if G.me}
  <div class="shell">
    <aside class="side">
      <div class="logo"><Icon name="sparkles" />Putzplan</div>
      {#each items as n (n.id)}
        <button class:on={S.tab === n.id} onclick={() => go(n.id)}><Icon name={n.icon} />{n.label}{#if n.id === 'uebersicht' && badge}<i class="nb">{badge}</i>{/if}</button>
      {/each}
      <div class="who"><span class="ava sm">{G.me.emoji}</span><div><b>{G.me.name}</b><small>{ROLES[G.me.role]}</small></div></div>
    </aside>
    <main>
      {#if !S.online}<div class="strip c-warn"><Icon name="wifi-off" size={16} />Keine Verbindung. Änderungen der anderen kommen gleich nach.</div>{/if}
      <View />
    </main>
  </div>
  <nav class="tabs">
    {#each items.filter(n => !n.desk) as n (n.id)}
      <button class:on={S.tab === n.id} onclick={() => go(n.id)}><Icon name={n.icon} /><span>{n.label}</span>{#if n.id === 'uebersicht' && badge}<i class="nb">{badge}</i>{/if}</button>
    {/each}
  </nav>
{/if}

{#each ui.sheets as s (s.id)}
  {#if s.full}
    <s.comp {...s.props} close={s.close} />
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="sheet-bg" transition:fade={{ duration: 120 }} onclick={e => e.target === e.currentTarget && s.close()}>
      <div class="sheet" class:big={s.props.big} transition:fly={{ y: 40, duration: 180 }}><s.comp {...s.props} close={s.close} /></div>
    </div>
  {/if}
{/each}
{#if ui.toast}{#key ui.toast.id}<div class="toast" transition:fade={{ duration: 120 }}>{ui.toast.msg}</div>{/key}{/if}
{#if ui.rain}
  {#key ui.rain.id}
    <div class="rain" aria-hidden="true">
      {#each ui.rain.drops as d, i (i)}<span style="left:{d.left}vw;font-size:{d.size}px;animation-duration:{d.dur}s;animation-delay:{d.delay}s">{d.e}</span>{/each}
    </div>
  {/key}
{/if}
