<script>
  import Icon from '../parts/Icon.svelte';
  import { S, G, switchPerson, leave } from '../lib/store.svelte.js';
  import { open, toast, tryDo } from '../lib/ui.svelte.js';
  import { enablePush, pushOn, isIOS, isStandalone } from '../lib/push.js';
  import { ROLES } from '../../../shared/logic.js';
  import Points from '../sheets/Points.svelte';
  import EmojiEdit from '../sheets/EmojiEdit.svelte';
  import TaskEdit from '../sheets/TaskEdit.svelte';
  import Invite from '../sheets/Invite.svelte';

  const me = $derived(G.me), my = $derived(G.calc.per[me.id]);
  const waiting = $derived(S.tasks.filter(t => t.proposed_by === me.id));
  let push = $state(pushOn()), install = $state(false);
  async function notif() {
    if (await tryDo(enablePush)) { push = true; toast('Benachrichtigungen sind an. Gleich kommt eine Test-Nachricht.'); }
  }
</script>

{#snippet item(icon, title, sub, onclick)}
  <button class="row" {onclick}>
    <span class="icb"><Icon name={icon} /></span>
    <span class="grow"><b>{title}</b>{#if sub}<small>{sub}</small>{/if}</span>
    <Icon name="chevron-right" />
  </button>
{/snippet}

<div class="narrow">
  <section class="card">
    <div class="row">
      <span class="ava xl">{me.emoji}</span>
      <div class="grow"><h1>{me.name}</h1><span class="chip c-brand" style="margin-top:4px"><Icon name={me.role === 'admin' ? 'shield-check' : 'user'} size={14} />{ROLES[me.role]}</span></div>
    </div>
    <div class="stats">
      <div><b>{my.today}{my.goal ? '/' + my.goal : ''}</b><small>heute</small></div>
      <div><b>{my.week}</b><small>Woche</small></div>
      <div><b>{my.streak}</b><small>Tage Serie</small></div>
      <div><b>{my.bank}</b><small>im Konto</small></div>
    </div>
  </section>

  <section class="card list">
    {@render item('history', 'Meine Punkte', 'Alle Einträge, Belohnungen und Abzüge', () => open(Points))}
    {@render item('smile', 'Mein Emoji & Emoji-Regen', `${me.emoji} · ${me.rain || 'Standard-Regen'}`, () => open(EmojiEdit))}
    {@render item('bell', 'Benachrichtigungen', push ? 'Sind an. Antippen für eine Test-Nachricht.' : isIOS && !isStandalone() ? 'Erst die App auf den Home-Bildschirm legen' : 'Waschtag, Tagesziel, Reaktionen, Belohnungen', notif)}
    {@render item('lightbulb', 'Aufgabe vorschlagen', waiting.length ? `Wartet auf OK: ${waiting.map(t => t.title).join(', ')}` : 'Fehlt etwas im Plan? Geht an die Admins.', () => open(TaskEdit))}
  </section>

  {#if G.admin}
    <section class="card list">
      {@render item('settings', 'Verwaltung', 'Aufgaben, Familie, Regeln, Protokoll', () => { S.tab = 'verwaltung'; scrollTo(0, 0); })}
      {@render item('qr-code', 'Familie einladen', 'Einladungslink und QR-Code', () => open(Invite))}
    </section>
  {/if}

  <section class="card list">
    {@render item('monitor-smartphone', 'App aufs Handy legen', 'Wie eine echte App auf dem Startbildschirm', () => (install = !install))}
    {#if install}<p class="hint" style="margin:0 0 10px">iPhone: Teilen-Knopf, dann „Zum Home-Bildschirm“. Android: Menü mit den drei Punkten, dann „App installieren“.</p>{/if}
    {@render item('users', 'Person wechseln', 'Jemand anders nutzt dieses Gerät', () => tryDo(switchPerson))}
    {@render item('log-out', 'Gerät abmelden', 'Die Daten der Familie bleiben erhalten', () => confirm('Dieses Gerät abmelden? Zum Wiederkommen brauchst du den Einladungslink.') && tryDo(leave))}
  </section>
  <p class="sub center">Putzplan Version 2</p>
</div>
