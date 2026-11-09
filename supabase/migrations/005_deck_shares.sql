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
