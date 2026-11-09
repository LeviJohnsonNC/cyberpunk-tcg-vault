-- 003: site-wide daily AI caps + in-app feedback. Safe to re-run.
-- Paste into Supabase Dashboard > SQL Editor > New query, then Run.

-- Site-wide AI counter: one row per feature per UTC day. Only server functions touch it.
create table if not exists public.ai_global_usage (
  feature text not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (feature, day)
);
alter table public.ai_global_usage enable row level security;
-- no policies: anon/authenticated can't read or write; the service role bypasses RLS

create or replace function public.bump_ai_global(p_feature text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ai_global_usage (feature, day, count)
  values (p_feature, (now() at time zone 'utc')::date, 1)
  on conflict (feature, day) do update set count = public.ai_global_usage.count + 1
  returning count;
$$;
revoke all on function public.bump_ai_global(text) from public, anon, authenticated;

-- Feedback: anyone can send, nobody can read through the API (read it in the Table Editor).
create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  kind       text not null default 'idea' check (kind in ('idea', 'bug', 'cards', 'other')),
  message    text not null check (char_length(message) between 3 and 2000),
  contact    text check (contact is null or char_length(contact) <= 200),
  page       text check (page is null or char_length(page) <= 100)
);
alter table public.feedback enable row level security;
drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
grant insert on public.feedback to anon, authenticated;
