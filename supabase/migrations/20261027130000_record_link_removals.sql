-- SPARK: record link removals in item history.
--
-- A deleted link otherwise leaves no trace, so undo_import could not tell that
-- an imported item had been worked on. Each removal now adds a 'link_removed'
-- entry to the history of every endpoint that still exists. undo_import
-- already protects items whose history changed after the import.
--
-- Additive: widens the allowed history kinds (existing rows still satisfy it)
-- and adds one trigger. No existing row is changed.

alter table public.item_entries drop constraint item_entries_kind_check;
alter table public.item_entries add constraint item_entries_kind_check
  check (kind in ('note', 'ai_challenge', 'status_change', 'link_removed'));

-- SECURITY DEFINER so the entry is written even when a removal is caused by a
-- cascade (deleting an item or an account). It only writes rows for the
-- link's own owner and only for items that still exist.
create function public.item_links_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_entries (item_id, user_id, kind, data)
  select i.id, i.user_id, 'link_removed',
         jsonb_build_object(
           'other_id', other.id_other,
           'other_title', (select o.title from public.items o where o.id = other.id_other)
         )
  from (values (old.a_id, old.b_id), (old.b_id, old.a_id)) as other(id_self, id_other)
  join public.items i on i.id = other.id_self and i.user_id = old.user_id;
  return null;
end;
$$;

revoke all on function public.item_links_after_delete() from public, anon, authenticated;

create trigger item_links_after_delete
  after delete on public.item_links
  for each row execute function public.item_links_after_delete();
