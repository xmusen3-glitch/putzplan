-- Update 4: Push-Benachrichtigungen 🔔
-- ERST die Edge Function "push" anlegen (siehe Anleitung), DANN dieses Skript: SQL Editor → einfügen → Run
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_subs (id text primary key, member_id text, sub text, created_at timestamptz default now());
create table if not exists public.push_config (id int primary key, public_key text, private_key text);
do $$
declare t text;
begin
  foreach t in array array['push_subs','push_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists familie on public.%I', t);
    execute format('create policy familie on public.%I for all to anon, authenticated using (public.fam_ok()) with check (public.fam_ok())', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Bei Änderungen die Push-Funktion anstupsen
create or replace function public.push_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://asjuadqjyqnspmjqbsaa.supabase.co/functions/v1/push?job=event',
    body := jsonb_build_object('table', TG_TABLE_NAME, 'type', TG_OP, 'record', to_jsonb(NEW),
                               'old_record', case when TG_OP = 'UPDATE' then to_jsonb(OLD) end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-familie', (select secret from public.fam_secret limit 1))
  );
  return NEW;
end $$;

drop trigger if exists push_completions_ins on public.completions;
create trigger push_completions_ins after insert on public.completions for each row execute function public.push_event();
drop trigger if exists push_completions_upd on public.completions;
create trigger push_completions_upd after update on public.completions for each row
  when (old.status is distinct from new.status or old.helpers is distinct from new.helpers) execute function public.push_event();
drop trigger if exists push_reactions on public.reactions;
create trigger push_reactions after insert on public.reactions for each row execute function public.push_event();
drop trigger if exists push_tasks on public.tasks;
create trigger push_tasks after insert on public.tasks for each row when (new.proposed_by is not null) execute function public.push_event();

-- Stündlicher Wecker: Waschtag (7 Uhr & 19 Uhr Vorabend), Tagesziel-Erinnerung (17 Uhr)
select cron.schedule('putzplan-stuendlich', '0 * * * *', $c$
  select net.http_post(
    url := 'https://asjuadqjyqnspmjqbsaa.supabase.co/functions/v1/push?job=hourly',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-familie', (select secret from public.fam_secret limit 1)))
$c$);

notify pgrst, 'reload schema';
