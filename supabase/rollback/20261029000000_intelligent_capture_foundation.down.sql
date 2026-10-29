-- ROLLBACK for 20261029000000_intelligent_capture_foundation.sql
--
-- Returns the schema to exactly its state before the migration. Run only if
-- Checkpoint A must be undone. All-or-nothing.
--
-- It refuses to run (and changes nothing) if Sprint 1 has already been used
-- for real: any suggestion applied, any type change or applied-suggestion
-- History entry, or any item with a summary. Undoing then would lose data,
-- and needs a separate, reviewed plan.
begin;

do $$
begin
  if exists (select 1 from public.item_entries where kind in ('type_change', 'suggestion_applied'))
     or exists (select 1 from public.items where summary is not null)
     or exists (select 1 from public.suggestions where status in ('accepted', 'edited')) then
    raise exception 'Sprint 1 data exists; this rollback would lose it. Nothing was changed.';
  end if;
end $$;

drop function public.apply_suggestions(uuid, jsonb);
drop function public.fail_analysis(uuid, text, text, jsonb, numeric);
drop function public.complete_analysis(uuid, text, text, jsonb, numeric, jsonb);
drop function public.mark_api_called(uuid);
drop function public.claim_analysis(uuid);
drop function public.recover_analyses();
drop function public.request_analysis(uuid, text, text);

drop table public.suggestions;
drop table public.analysis_runs;

alter table public.item_entries drop constraint item_entries_kind_check;
alter table public.item_entries add constraint item_entries_kind_check
  check (kind in (
    'note', 'hypothesis', 'challenge', 'decision', 'lesson',   -- Reasoning Log (written by the user)
    'ai_challenge',                                            -- reserved for future AI guidance
    'status_change', 'link_removed'                            -- automatic History
  ));

drop trigger items_after_type_change on public.items;
drop function public.items_after_type_change();

drop trigger items_after_status_change on public.items;
create trigger items_after_status_change
  after update of status on public.items
  for each row
  when (old.status is distinct from new.status)
  execute function public.items_after_status_change();

create or replace function public.items_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.original_body is not null and new.original_body is distinct from old.original_body then
    raise exception 'original_body is immutable';
  end if;
  if new.type is distinct from old.type then
    raise exception 'type is immutable';
  end if;
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'user_id and created_at are immutable';
  end if;
  if new.title       is distinct from old.title
  or new.status      is distinct from old.status
  or new.category_id is distinct from old.category_id
  or new.source_name is distinct from old.source_name
  or new.source_url  is distinct from old.source_url
  or new.origin      is distinct from old.origin then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

alter table public.items drop column summary;

commit;
