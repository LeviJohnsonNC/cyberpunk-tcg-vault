-- 002: per-feature AI usage counter (AI deck refinement). Safe to re-run.
-- Paste into Supabase Dashboard > SQL Editor > New query, then Run.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, feature, day)
);
alter table public.ai_usage enable row level security;

drop policy if exists "read own ai usage" on public.ai_usage;
create policy "read own ai usage" on public.ai_usage
  for select using (auth.uid() = user_id);

-- Atomic increment used by server functions (service role). Returns today's new count.
create or replace function public.bump_ai_usage(p_user uuid, p_feature text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage (user_id, feature, day, count)
  values (p_user, p_feature, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, feature, day) do update set count = public.ai_usage.count + 1
  returning count;
$$;
revoke all on function public.bump_ai_usage(uuid, text) from public, anon, authenticated;
