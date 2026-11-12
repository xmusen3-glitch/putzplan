-- Update für: Zusammen putzen 🤝 + Aufgaben-Vorschläge 💡
-- Supabase → SQL Editor → einfügen → Run
alter table public.tasks add column if not exists proposed_by text;
alter table public.completions add column if not exists helpers text;
notify pgrst, 'reload schema';
