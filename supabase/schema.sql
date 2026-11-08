-- Cyberpunk TCG Vault: Supabase schema
-- Paste into Supabase Dashboard > SQL Editor > New query, then Run. Safe to re-run.

-- ---------- collection ----------
create table if not exists public.collection_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_slug   text not null,
  printing_id text not null,
  qty         integer not null check (qty > 0 and qty <= 999),
  note        text,
  updated_at  timestamptz not null default now(),
  unique (user_id, printing_id)
);
create index if not exists collection_items_user_idx on public.collection_items (user_id);

-- ---------- decks ----------
create table if not exists public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  legends     text[] not null default '{}',
  cards       jsonb not null default '{}'::jsonb,
  sideboard   jsonb not null default '{}'::jsonb,
  notes       text not null default '',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists decks_user_idx on public.decks (user_id);
create index if not exists decks_public_idx on public.decks (is_public) where is_public;

-- ---------- photo-scan rate limiting (written only by the server function) ----------
create table if not exists public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0,
  primary key (user_id, day)
);

-- ---------- row level security ----------
alter table public.collection_items enable row level security;
alter table public.decks            enable row level security;
alter table public.scan_usage       enable row level security;

drop policy if exists "own collection" on public.collection_items;
create policy "own collection" on public.collection_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own decks" on public.decks;
create policy "own decks" on public.decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public decks readable" on public.decks;
create policy "public decks readable" on public.decks
  for select using (is_public);

drop policy if exists "read own scan usage" on public.scan_usage;
create policy "read own scan usage" on public.scan_usage
  for select using (auth.uid() = user_id);

-- Atomic increment used by /api/scan (service role). Returns the new count for today.
create or replace function public.bump_scan_usage(p_user uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.scan_usage (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = public.scan_usage.count + 1
  returning count;
$$;
revoke all on function public.bump_scan_usage(uuid) from public, anon, authenticated;
