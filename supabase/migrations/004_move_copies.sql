-- 004: move copies between printings in one transaction (used to resolve "Printing unspecified"
-- holdings). Safe to re-run. Paste into Supabase Dashboard > SQL Editor > New query, then Run.
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
