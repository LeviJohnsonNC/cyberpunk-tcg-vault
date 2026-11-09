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

-- ---------- AI usage (added in migration 002) ----------
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

-- ===== from migrations/003_global_caps_feedback.sql =====

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

-- ===== from migrations/004_move_copies.sql =====
--
-- p_expect_from is the source quantity the app saw. If it differs (for example a retry after a
-- move that already committed), nothing changes and the call fails, so copies are never lost or
-- duplicated. Runs as the calling user, so row-level security still applies.
create or replace function public.move_copies(p_slug text, p_from text, p_to text, p_qty integer, p_expect_from integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  have integer;
  src_note text;
  result integer;
begin
  if p_qty is null or p_qty <= 0 or p_from = p_to then
    raise exception 'invalid move';
  end if;
  select qty, note into have, src_note
    from collection_items
   where user_id = auth.uid() and printing_id = p_from
   for update;
  if have is null or have <> p_expect_from or have < p_qty then
    raise exception 'stale move: expected % copies, found %', p_expect_from, coalesce(have, 0);
  end if;
  if have = p_qty then
    delete from collection_items where user_id = auth.uid() and printing_id = p_from;
  else
    update collection_items set qty = qty - p_qty, updated_at = now()
     where user_id = auth.uid() and printing_id = p_from;
  end if;
  insert into collection_items (user_id, card_slug, printing_id, qty, note)
  values (auth.uid(), p_slug, p_to, p_qty, src_note)
  on conflict (user_id, printing_id) do update
    set qty = collection_items.qty + excluded.qty,
        note = coalesce(collection_items.note, excluded.note),
        updated_at = now()
  returning qty into result;
  return result;
end;
$$;
revoke all on function public.move_copies(text, text, text, integer, integer) from public, anon;
grant execute on function public.move_copies(text, text, text, integer, integer) to authenticated;

-- 005: unlisted deck share links. Safe to re-run. Paste into Supabase Dashboard > SQL Editor >
-- New query, then Run.
--
-- A share is a frozen snapshot of a saved deck behind a random token. One share per deck.
-- Editing the deck leaves the snapshot alone; replacing rotates the token (the old link dies in
-- the same statement); revoking or deleting the deck removes the share.
--
-- Nobody can list shares: the only anonymous access is get_shared_deck(token), which returns the
-- snapshot fields and nothing else (no owner, no notes, no deck id). Owners can see and delete
-- their own share rows; writes go through publish_deck_share, which snapshots the deck as it is
-- stored in the database, so a link always shows a list that was actually saved.

-- Saved decks are private. The old public-read policy was never used by the app and would have
-- let other users' decks show up in "My decks".
drop policy if exists "public decks readable" on public.decks;
drop index if exists public.decks_public_idx;

create table if not exists public.deck_shares (
  deck_id     uuid primary key references public.decks (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  token       text not null unique check (token ~ '^[0-9a-f]{32}$'),
  name        text not null check (char_length(name) between 1 and 80),
  legends     text[] not null check (cardinality(legends) <= 3),
  cards       jsonb not null check (jsonb_typeof(cards) = 'object' and pg_column_size(cards) < 16000),
  sideboard   jsonb not null check (jsonb_typeof(sideboard) = 'object' and pg_column_size(sideboard) < 4000),
  created_at  timestamptz not null default now()
);
create index if not exists deck_shares_user_idx on public.deck_shares (user_id);

alter table public.deck_shares enable row level security;

drop policy if exists "read own shares" on public.deck_shares;
create policy "read own shares" on public.deck_shares
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "revoke own shares" on public.deck_shares;
create policy "revoke own shares" on public.deck_shares
  for delete to authenticated using (auth.uid() = user_id);

-- No insert or update policies: rows are written only by publish_deck_share below.

-- Quantities must be whole numbers from 1 to 3.
create or replace function public.deck_qty_ok(j jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(bool_and(case when jsonb_typeof(value) = 'number' then (value)::numeric in (1, 2, 3) else false end), true)
  from jsonb_each(j);
$$;

-- Create the share for a saved deck, or return the existing one. p_replace = true issues a new
-- token and a fresh snapshot, which invalidates the old link.
create or replace function public.publish_deck_share(p_deck_id uuid, p_replace boolean default false)
returns table (token text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  d public.decks%rowtype;
  s public.deck_shares%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sign in to share decks';
  end if;
  select * into d from public.decks where id = p_deck_id and user_id = auth.uid();
  if not found then
    raise exception 'deck not found';
  end if;

  select * into s from public.deck_shares where deck_id = d.id for update;
  if found and not p_replace then
    return query select s.token, s.created_at;
    return;
  end if;

  if cardinality(d.legends) > 3 or not public.deck_qty_ok(d.cards) or not public.deck_qty_ok(d.sideboard) then
    raise exception 'deck is not shareable';
  end if;

  insert into public.deck_shares as t (deck_id, user_id, token, name, legends, cards, sideboard, created_at)
  values (d.id, d.user_id, replace(gen_random_uuid()::text, '-', ''), d.name, d.legends, d.cards, d.sideboard, now())
  on conflict (deck_id) do update
    set token = excluded.token, name = excluded.name, legends = excluded.legends,
        cards = excluded.cards, sideboard = excluded.sideboard, created_at = excluded.created_at
  returning t.token, t.created_at into s.token, s.created_at;

  return query select s.token, s.created_at;
end;
$$;
revoke all on function public.publish_deck_share(uuid, boolean) from public, anon;
grant execute on function public.publish_deck_share(uuid, boolean) to authenticated;

-- The only public read: one snapshot by exact token, allowlisted fields.
create or replace function public.get_shared_deck(p_token text)
returns table (name text, legends text[], cards jsonb, sideboard jsonb, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, s.legends, s.cards, s.sideboard, s.created_at
  from public.deck_shares s
  where p_token ~ '^[0-9a-f]{32}$' and s.token = p_token;
$$;
revoke all on function public.get_shared_deck(text) from public;
grant execute on function public.get_shared_deck(text) to anon, authenticated;
