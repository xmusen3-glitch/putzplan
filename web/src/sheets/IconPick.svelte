<script>
  import Icon from '../parts/Icon.svelte';
  import Head from '../parts/Head.svelte';
  import { S, put } from '../lib/store.svelte.js';
  import { tryDo } from '../lib/ui.svelte.js';
  import { ROOM_ICONS, roomOf } from '../lib/rooms.js';
  let { room, close } = $props();
  const current = $derived(roomOf(room, S.settings).icon);
  const pick = async icon => (await tryDo(() => put('/settings', { rooms: { ...S.settings.rooms, [room]: icon } }))) && close();
</script>

<Head title="Icon für {room}" {close} />
<div class="pick">
  {#each ROOM_ICONS as i (i)}<button class:on={current === i} onclick={() => pick(i)} aria-label={i}><Icon name={i} size={24} /></button>{/each}
</div>
