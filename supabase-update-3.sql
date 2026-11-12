-- Update 3: Punkte pro Aufgabe ⭐, Reaktionen & Kommentare ❤️💬 (enthält auch Update 2)
-- Supabase → SQL Editor → alles einfügen → Run
alter table public.tasks add column if not exists proposed_by text;
alter table public.completions add column if not exists helpers text;
alter table public.tasks add column if not exists points int;

create table if not exists public.reactions (
  id text primary key, completion_id text, member_id text, emoji text, text text, created_at timestamptz default now()
);
alter table public.reactions enable row level security;
drop policy if exists familie on public.reactions;
create policy familie on public.reactions for all to anon, authenticated using (public.fam_ok()) with check (public.fam_ok());
grant select, insert, update, delete on public.reactions to anon, authenticated;

-- Punkte nach Anstrengung & Ekel-Faktor (nur wo noch keine eigenen Punkte gesetzt sind)
update public.tasks t set points = v.p from (values
  ('eing-aufr',2),
  ('eing-schuhe',1),
  ('eing-ranzen',1),
  ('eing-boden',3),
  ('flur-saugen',3),
  ('flur-wischen',4),
  ('waschflur',3),
  ('wz-decken',1),
  ('wz-couch',2),
  ('wz-tisch',2),
  ('wz-kommode',2),
  ('wz-tv',3),
  ('wz-unter-couch',4),
  ('ez-tisch',2),
  ('ez-stuehle',1),
  ('ez-stuehle-sauber',3),
  ('boden-saugen',4),
  ('boden-wischen',4),
  ('k-sm-aus',3),
  ('k-sm-ein',3),
  ('k-flaechen',3),
  ('k-muell-sort',3),
  ('k-muell-raus',3),
  ('k-boden',4),
  ('k-kuehl',5),
  ('gb-becken',2),
  ('gb-wc',4),
  ('gb-eimer',2),
  ('gb-auff',1),
  ('gb-fliesen',3),
  ('gb-dusche',5),
  ('spinnweben',4),
  ('fenster',5),
  ('zimmer',5),
  ('garten-rasen',6),
  ('garten-laub',4),
  ('garten-unkraut',5),
  ('auffahrt-fegen',3),
  ('garage-ordnen',5),
  ('durch-drin',3),
  ('durch-draussen',2)
) as v(id, p) where t.id = v.id and t.points is null;
update public.tasks set title = 'Müll rausbringen (auch Bio 🤢)' where id = 'k-muell-raus';

-- Tagesziel an die neuen Punkte anpassen
update public.settings set data = jsonb_set(coalesce(data, '{}'::jsonb), '{tagesziel}', '10') where id = 1;

notify pgrst, 'reload schema';
