-- SPARK: safely undo an import.
--
-- Only items created by that import are candidates. A candidate is PROTECTED
-- (kept) if anything happened to it after the import:
--   - its title, status, category, source, URL or origin was edited
--   - a note or status change was added to its history
--   - a link to or from it was added
--   - a tag was attached
--   - a milestone or next action was added
-- Called with p_apply = false it only reports what would happen.
-- Called with p_apply = true it deletes the unprotected items, in one transaction.

create function public.undo_import(p_import uuid, p_apply boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_at      timestamptz;
  v_undone  timestamptz;
  v_removed integer := 0;
  v_report  jsonb;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select created_at, undone_at into v_at, v_undone
  from public.imports where id = p_import and user_id = v_uid
  for update;
  if v_at is null then
    raise exception 'import not found';
  end if;

  with candidates as (
    select i.id, i.title, i.type, i.updated_at
    from public.items i
    where i.import_id = p_import and i.user_id = v_uid
  ),
  reasons as (
    select c.id, c.title, c.type,
      array_remove(array[
        case when c.updated_at > v_at then 'edited' end,
        case when exists (select 1 from public.item_entries e where e.item_id = c.id and e.created_at > v_at) then 'history added' end,
        case when exists (select 1 from public.item_links l where (l.a_id = c.id or l.b_id = c.id) and l.created_at > v_at) then 'linked since' end,
        case when exists (select 1 from public.item_tags t where t.item_id = c.id and t.created_at > v_at) then 'tagged since' end,
        case when exists (select 1 from public.milestones m where m.item_id = c.id)
               or exists (select 1 from public.actions a where a.item_id = c.id) then 'has milestones or actions' end
      ], null) as why
    from candidates c
  )
  select jsonb_build_object(
    'import_id', p_import,
    'already_undone', v_undone is not null,
    'total', count(*),
    'removable', count(*) filter (where cardinality(why) = 0),
    'protected', coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'type', type, 'reasons', to_jsonb(why)) order by title)
                   filter (where cardinality(why) > 0), '[]'::jsonb)
  )
  into v_report
  from reasons;

  if not p_apply then
    return v_report;
  end if;

  delete from public.items i
  where i.import_id = p_import
    and i.user_id = v_uid
    and not (
         i.updated_at > v_at
      or exists (select 1 from public.item_entries e where e.item_id = i.id and e.created_at > v_at)
      or exists (select 1 from public.item_links l where (l.a_id = i.id or l.b_id = i.id) and l.created_at > v_at)
      or exists (select 1 from public.item_tags t where t.item_id = i.id and t.created_at > v_at)
      or exists (select 1 from public.milestones m where m.item_id = i.id)
      or exists (select 1 from public.actions a where a.item_id = i.id)
    );
  get diagnostics v_removed = row_count;

  update public.imports
  set undone_at = now(), removed_count = removed_count + v_removed
  where id = p_import;

  return v_report || jsonb_build_object('removed', v_removed, 'applied', true);
end;
$$;

revoke all on function public.undo_import(uuid, boolean) from public, anon;
grant execute on function public.undo_import(uuid, boolean) to authenticated;
