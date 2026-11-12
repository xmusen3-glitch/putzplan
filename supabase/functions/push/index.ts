// Familien-Putzplan – Push-Benachrichtigungen 🔔
// Supabase → Edge Functions → "Deploy a new function" → "Via Editor" → Name: push → diesen Code einfügen → Deploy
// Danach in den Function-Einstellungen "Verify JWT" AUSschalten.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "https://asjuadqjyqnspmjqbsaa.supabase.co";
const KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_v53B7ty4azkyuHNYaCTQVw_7zwPGi5f";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const berlin = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d).map(x => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday as string] ?? 1;
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, wd };
};
const helpersOf = (c: any): string[] => { try { const a = JSON.parse(c?.helpers || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const fam = req.headers.get("x-familie") ?? "";
  if (!fam) return json({ error: "kein Familien-Code" }, 401);
  const sb = createClient(URL_, KEY, { auth: { persistSession: false }, global: { headers: { "x-familie": fam } } });

  // VAPID-Schlüssel: beim ersten Mal automatisch erzeugen
  const { data: cfg, error: cfgErr } = await sb.from("push_config").select("*").eq("id", 1).maybeSingle();
  if (cfgErr) return json({ error: cfgErr.message }, 500);
  let keys = cfg;
  if (!keys) {
    const { data: probe } = await sb.from("members").select("id").limit(1);
    if (!probe?.length) return json({ error: "Familien-Code falsch?" }, 401);
    const k = webpush.generateVAPIDKeys();
    keys = { id: 1, public_key: k.publicKey, private_key: k.privateKey };
    const { error } = await sb.from("push_config").insert(keys);
    if (error) return json({ error: error.message }, 500);
  }
  webpush.setVapidDetails("mailto:putzplan@example.com", keys.public_key, keys.private_key);

  const url = new URL(req.url);
  const job = url.searchParams.get("job");
  if (job === "key") return json({ publicKey: keys.public_key });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const { data: members } = await sb.from("members").select("*");
  const M = Object.fromEntries((members ?? []).map((m: any) => [m.id, m]));
  const name = (id: string) => M[id]?.name ?? "Jemand";
  const out: { to: string; title: string; body: string }[] = [];
  const add = (to: string | undefined, title: string, text: string) => { if (to && M[to]) out.push({ to, title, body: text }); };

  if (job === "test") add(body.member_id, "Putzplan 🔔", "Benachrichtigungen funktionieren! 🎉");

  if (job === "event") {
    const { table, type, record: r, old_record: o } = body;
    if (table === "completions" && r) {
      if (type === "INSERT") {
        if (r.task_id === "bonus") add(r.member_id, "⭐ Belohnung!", `+${r.points} Punkte: ${r.title}`);
        else if (r.task_id === "warn") add(r.member_id, "⚠️ Abmahnung", `${r.title} (${r.points} Punkte)`);
        else if (r.task_id === "frei") add(r.member_id, "🏖️ Du hast frei!", `Am ${String(r.period).split("-").reverse().slice(0, 2).join(".")}. – ${r.title}`);
        else if (r.task_id === "adhoc" && r.created_by && r.created_by !== r.member_id) add(r.member_id, "🍳 Neue Aufgabe für dich", r.title);
        for (const hId of helpersOf(r)) add(hId, "🤝 Teamwork!", `${name(r.member_id)} hat dich dazugeholt: ${r.title}`);
      }
      if (type === "UPDATE" && o) {
        const before = new Set(helpersOf(o));
        for (const hId of helpersOf(r)) if (!before.has(hId)) add(r.member_id, "🤝 Hilfe ist da!", `${name(hId)} hilft dir bei: ${r.title}`);
        if (o.status === "done" && r.status === "rejected" && r.note === "abgelehnt") add(r.member_id, "👎 Nochmal ran!", `„${r.title}“ wurde abgelehnt – die Aufgabe ist wieder offen.`);
      }
    }
    if (table === "reactions" && type === "INSERT" && r) {
      const { data: c } = await sb.from("completions").select("member_id,title,helpers").eq("id", r.completion_id).maybeSingle();
      if (c) for (const to of [c.member_id, ...helpersOf(c)]) if (to !== r.member_id)
        add(to, r.text ? `💬 ${name(r.member_id)}` : `${r.emoji} ${name(r.member_id)}`, r.text ? `${r.text} (${c.title})` : `hat auf dein Foto reagiert: ${c.title}`);
    }
    if (table === "tasks" && type === "INSERT" && r?.proposed_by) {
      for (const m of members ?? []) if (m.is_admin) add(m.id, "💡 Neuer Vorschlag", `${name(r.proposed_by)}: ${r.title}`);
    }
  }

  if (job === "hourly") {
    const now = berlin();
    const tomorrowWd = now.wd % 7 + 1;
    const active = (members ?? []).filter((m: any) => m.active);
    if (now.hour === 7) for (const m of active) if (+m.waschtag === now.wd) add(m.id, "🧺 Heute ist dein Waschtag!", "Wäschekorb runterbringen nicht vergessen 😉");
    if (now.hour === 19) for (const m of active) if (+m.waschtag === tomorrowWd) add(m.id, "🧺 Morgen ist Waschtag", "Denk an deinen Wäschekorb!");
    if (now.hour === 17) {
      const { data: s } = await sb.from("settings").select("data").eq("id", 1).maybeSingle();
      const ziel = +(s?.data?.tagesziel ?? 10);
      const since = new Date(Date.now() - 36 * 3600e3).toISOString();
      const { data: cs } = await sb.from("completions").select("*").eq("status", "done").gte("after_at", since);
      const today = (cs ?? []).filter((c: any) => c.after_at && berlin(new Date(c.after_at)).day === now.day && c.task_id !== "bonus" && c.task_id !== "warn");
      for (const m of active) {
        const w = +(now.wd >= 6 ? m.w_weekend : m.w_weekday) || 0;
        const goal = Math.round(w * ziel);
        if (goal <= 0) continue;
        let p = 0;
        for (const c of today) {
          const ids = [c.member_id, ...helpersOf(c).filter((x) => x !== c.member_id)];
          if (!ids.includes(m.id)) continue;
          p += ids.length > 1 && +c.points > 0 ? Math.ceil(+c.points / ids.length) : +c.points || 0;
        }
        if (p < goal) add(m.id, p === 0 ? "🧹 Noch nix gemacht heute?" : "💪 Fast geschafft!", `Noch ${goal - p} Punkte bis zu deinem Tagesziel. Such dir was aus!`);
      }
    }
  }

  // Senden
  let sent = 0;
  if (out.length) {
    const { data: subs } = await sb.from("push_subs").select("*").in("member_id", [...new Set(out.map((x) => x.to))]);
    for (const n of out) for (const s of (subs ?? []).filter((x: any) => x.member_id === n.to)) {
      try { await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify({ title: n.title, body: n.body }), { TTL: 6 * 3600 }); sent++; }
      catch (e: any) { console.error("push fail", e?.statusCode, e?.message); if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("id", s.id); }
    }
  }
  return json({ ok: true, queued: out.length, sent });
});
