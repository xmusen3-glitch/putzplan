-- =====================================================================
--  Familien-Putzplan – Datenbank einrichten (einmalig)
--  Supabase → SQL Editor → "New query" → alles einfügen → "Run"
--  Ganz unten erscheint dein FAMILIEN-GEHEIMCODE. Den brauchst du gleich!
-- =====================================================================

-- Geheimcode (nur über den Code kommt man an die Daten)
create table if not exists public.fam_secret (secret text primary key);
alter table public.fam_secret enable row level security;
revoke all on public.fam_secret from anon, authenticated;
insert into public.fam_secret (secret)
  select replace(gen_random_uuid()::text, '-', '')
  where not exists (select 1 from public.fam_secret);

create or replace function public.fam_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-familie', '')
         = (select secret from public.fam_secret limit 1)
$$;
grant execute on function public.fam_ok() to anon, authenticated;

create table if not exists public.members (
  id text primary key, name text, emoji text, is_admin boolean default false, klein boolean default false,
  w_weekday numeric default 1, w_weekend numeric default 1, waschtag int, active boolean default true,
  pin_hash text, sort int default 0, rain text
);
alter table public.members add column if not exists rain text;
create table if not exists public.tasks (
  id text primary key, title text, room text, freq text, day int default 0, minutes int default 5,
  leicht boolean default false, per_person boolean default false, active boolean default true
);
create table if not exists public.completions (
  id text primary key, task_id text, title text, member_id text, period text, slot text default '',
  status text, before_photo text, before_at timestamptz, after_photo text, after_at timestamptz,
  points int default 0, note text, created_by text, created_at timestamptz default now()
);
-- Eine Aufgabe pro Zeitraum nur einmal (verhindert doppeltes Starten)
create unique index if not exists completions_once on public.completions (task_id, period, slot)
  where status <> 'rejected' and task_id <> 'adhoc';
create index if not exists completions_created on public.completions (created_at);
create table if not exists public.photos (id text primary key, data text, created_at timestamptz default now());
create table if not exists public.settings (id int primary key, data jsonb);

do $$
declare t text;
begin
  foreach t in array array['members','tasks','completions','photos','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists familie on public.%I', t);
    execute format('create policy familie on public.%I for all to anon, authenticated using (public.fam_ok()) with check (public.fam_ok())', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- 👇 DAS ist dein Familien-Geheimcode:
select secret as "FAMILIEN-GEHEIMCODE" from public.fam_secret;
