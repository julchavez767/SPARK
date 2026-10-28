-- SPARK: import Reasoning Log entries.
--
-- Additive. Existing rows, policies and behaviour are unchanged:
--   * item_entries gains two optional columns:
--       import_id   - which import added the entry (NULL for everything typed in the app)
--       occurred_on - the ORIGINAL date of the thought, only when the source supports it:
--                     'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. NULL means unknown.
--     created_at keeps meaning "when SPARK recorded it" (for imports: the import time).
--   * imports gains entry counters.
--   * import_items gains an optional 4th argument, p_entries (default '[]'), so the
--     current app's 3-argument calls keep working unchanged.
--   * undo_import also removes the reasoning entries THAT import attached to items
--     that were already in SPARK. Nothing else: entries typed in the app, entries
--     from other imports and automatic History are never touched.
--   * One narrow DELETE policy makes that possible. It only matches an entry whose
--     import_id equals the import being undone, and only while undo_import runs.
--     Normal app use stays append-only.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.item_entries
  add column import_id   uuid,
  add column occurred_on text check (
    occurred_on is null
    or occurred_on ~ '^[0-9]{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12][0-9]|3[01]))?)?$'
  );

alter table public.item_entries
  add constraint item_entries_import_fk foreign key (import_id, user_id)
    references public.imports (id, user_id) on delete set null (import_id);

create index item_entries_import_idx on public.item_entries (import_id) where import_id is not null;

alter table public.imports
  add column entry_count          integer not null default 0,  -- entries written by this import
  add column attached_entry_count integer not null default 0,  -- of those, on items already in SPARK
  add column entries_removed      integer not null default 0;  -- attached entries removed by undo

-- ---------------------------------------------------------------------------
-- Undo may remove ONLY the entries of the import being undone
-- ---------------------------------------------------------------------------
create policy "undo removes its import's entries" on public.item_entries for delete to authenticated
  using (
    user_id = (select auth.uid())
    and import_id is not null
    and import_id::text = current_setting('spark.undo_import', true)
  );

-- ---------------------------------------------------------------------------
-- import_items: same as before, plus reasoning entries
-- p_entries: [{ target, kind, body, occurred_on, pos }]
--   target: a row key from p_items (new item) or the id of an item the user owns
--   kind:   note | hypothesis | challenge | decision | lesson
-- An entry identical (same item, same type, same text ignoring case and spacing)
-- to one already logged is skipped, so re-importing never duplicates reasoning.
-- ---------------------------------------------------------------------------
drop function public.import_items(text, jsonb, jsonb);

create function public.import_items(p_file_name text, p_items jsonb, p_links jsonb, p_entries jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_import   uuid;
  v_map      jsonb := '{}'::jsonb;
  r          jsonb;
  v_id       uuid;
  v_cat      uuid;
  v_tag      uuid;
  v_name     text;
  v_created  timestamptz;
  v_a        uuid;
  v_b        uuid;
  v_items    integer := 0;
  v_links    integer := 0;
  v_inserted integer;
  v_kind     text;
  v_body     text;
  v_target   text;
  v_item     uuid;
  v_is_new   boolean;
  v_on_new   integer := 0;
  v_attached integer := 0;
  v_logged   integer := 0;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'nothing to import';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    p_entries := '[]'::jsonb;
  end if;
  if jsonb_array_length(p_items) = 0 and jsonb_array_length(p_entries) = 0 then
    raise exception 'nothing to import';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'too many items in one import (limit 1000)';
  end if;
  if jsonb_array_length(p_entries) > 10000 then
    raise exception 'too many reasoning entries in one import (limit 10000)';
  end if;

  insert into public.imports (file_name) values (left(nullif(btrim(p_file_name), ''), 200))
  returning id into v_import;

  for r in select value from jsonb_array_elements(p_items) loop
    -- Category: reuse by name (any capitalization), otherwise create.
    v_cat := null;
    v_name := nullif(btrim(r->>'category'), '');
    if v_name is not null then
      select id into v_cat from public.categories where user_id = v_uid and lower(name) = lower(v_name);
      if v_cat is null then
        insert into public.categories (name) values (v_name) returning id into v_cat;
      end if;
    end if;

    v_created := coalesce((r->>'created')::timestamptz, now());

    insert into public.items (
      type, status, title, original_body, category_id,
      source_name, source_url, origin, import_id, created_at, updated_at
    ) values (
      r->>'type',
      nullif(r->>'status', ''),
      r->>'title',
      nullif(r->>'description', ''),
      v_cat,
      nullif(btrim(r->>'source_name'), ''),
      nullif(btrim(r->>'source_url'), ''),
      nullif(r->>'origin', ''),
      v_import,
      v_created,
      v_created
    )
    returning id into v_id;

    v_map := v_map || jsonb_build_object(r->>'key', v_id);
    v_items := v_items + 1;

    -- Tags: reuse by name, otherwise create, then attach.
    if jsonb_typeof(r->'tags') = 'array' then
      for v_name in select btrim(value) from jsonb_array_elements_text(r->'tags') loop
        continue when v_name = '';
        v_tag := null;
        select id into v_tag from public.tags where user_id = v_uid and lower(name) = lower(v_name);
        if v_tag is null then
          insert into public.tags (name) values (v_name) returning id into v_tag;
        end if;
        insert into public.item_tags (item_id, tag_id) values (v_id, v_tag) on conflict do nothing;
      end loop;
    end if;
  end loop;

  -- Links: row keys map to new ids; anything else must be an existing item id.
  if jsonb_typeof(p_links) = 'array' then
    for r in select value from jsonb_array_elements(p_links) loop
      v_a := coalesce((v_map->>(r->>'a'))::uuid, (r->>'a')::uuid);
      v_b := coalesce((v_map->>(r->>'b'))::uuid, (r->>'b')::uuid);
      continue when v_a = v_b;
      insert into public.item_links (a_id, b_id) values (least(v_a, v_b), greatest(v_a, v_b))
      on conflict do nothing;
      get diagnostics v_inserted = row_count;
      v_links := v_links + v_inserted;
    end loop;
  end if;

  -- Reasoning entries. Row keys map to new items; anything else must be the id
  -- of an item the caller owns (the (item_id, user_id) foreign key and
  -- row-level security reject anyone else's, which aborts the whole import).
  for r in select value from jsonb_array_elements(p_entries) loop
    v_kind := r->>'kind';
    if v_kind is null or v_kind not in ('note', 'hypothesis', 'challenge', 'decision', 'lesson') then
      raise exception 'invalid reasoning type';
    end if;
    v_body := btrim(coalesce(r->>'body', ''));
    if v_body = '' then
      raise exception 'empty reasoning entry';
    end if;

    v_target := r->>'target';
    v_item := (v_map->>v_target)::uuid;
    v_is_new := v_item is not null;
    if not v_is_new then
      v_item := v_target::uuid;
    end if;

    if exists (
      select 1 from public.item_entries e
      where e.item_id = v_item
        and e.kind = v_kind
        and lower(regexp_replace(btrim(e.body), '\s+', ' ', 'g')) = lower(regexp_replace(v_body, '\s+', ' ', 'g'))
    ) then
      v_logged := v_logged + 1;
      continue;
    end if;

    insert into public.item_entries (item_id, kind, body, occurred_on, import_id, data)
    values (
      v_item,
      v_kind,
      v_body,
      nullif(r->>'occurred_on', ''),
      v_import,
      jsonb_build_object('pos', coalesce((r->>'pos')::integer, 0))
    );

    if v_is_new then
      v_on_new := v_on_new + 1;
    else
      v_attached := v_attached + 1;
    end if;
  end loop;

  update public.imports
  set item_count = v_items,
      link_count = v_links,
      entry_count = v_on_new + v_attached,
      attached_entry_count = v_attached
  where id = v_import;

  return jsonb_build_object(
    'import_id', v_import,
    'items', v_items,
    'links', v_links,
    'entries', v_on_new + v_attached,
    'entries_on_new', v_on_new,
    'entries_attached', v_attached,
    'entries_already_logged', v_logged
  );
end;
$$;

revoke all on function public.import_items(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_items(text, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- undo_import: unchanged rules for items, plus removal of the entries this
-- import attached to items that were already in SPARK.
--   * An imported item's own imported entries don't count as "worked on".
--   * Items that are kept (worked on) keep their imported entries.
--   * Removed items take their entries with them, as before.
-- ---------------------------------------------------------------------------
create or replace function public.undo_import(p_import uuid, p_apply boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_at        timestamptz;
  v_undone    timestamptz;
  v_removed   integer := 0;
  v_entries   integer := 0;
  v_attached  integer := 0;
  v_targets   integer := 0;
  v_report    jsonb;
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
        case when exists (select 1 from public.item_entries e
                          where e.item_id = c.id and e.created_at > v_at
                            and e.import_id is distinct from p_import) then 'history added' end,
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

  -- Entries this import attached to items that were already in SPARK.
  select count(*), count(distinct e.item_id) into v_attached, v_targets
  from public.item_entries e
  join public.items i on i.id = e.item_id
  where e.import_id = p_import and e.user_id = v_uid
    and i.import_id is distinct from p_import;

  v_report := v_report || jsonb_build_object('entries_attached', v_attached, 'attached_items', v_targets);

  if not p_apply then
    return v_report;
  end if;

  delete from public.items i
  where i.import_id = p_import
    and i.user_id = v_uid
    and not (
         i.updated_at > v_at
      or exists (select 1 from public.item_entries e
                 where e.item_id = i.id and e.created_at > v_at
                   and e.import_id is distinct from p_import)
      or exists (select 1 from public.item_links l where (l.a_id = i.id or l.b_id = i.id) and l.created_at > v_at)
      or exists (select 1 from public.item_tags t where t.item_id = i.id and t.created_at > v_at)
      or exists (select 1 from public.milestones m where m.item_id = i.id)
      or exists (select 1 from public.actions a where a.item_id = i.id)
    );
  get diagnostics v_removed = row_count;

  -- Remove only this import's entries on items that did not come from this
  -- import. Kept imported items keep theirs. The policy above only allows this
  -- while the setting names this import; it is cleared straight after.
  perform set_config('spark.undo_import', p_import::text, true);
  delete from public.item_entries e
  where e.import_id = p_import
    and e.user_id = v_uid
    and not exists (select 1 from public.items i where i.id = e.item_id and i.import_id = p_import);
  get diagnostics v_entries = row_count;
  perform set_config('spark.undo_import', '', true);

  update public.imports
  set undone_at = now(),
      removed_count = removed_count + v_removed,
      entries_removed = entries_removed + v_entries
  where id = p_import;

  return v_report || jsonb_build_object('removed', v_removed, 'entries_removed', v_entries, 'applied', true);
end;
$$;

revoke all on function public.undo_import(uuid, boolean) from public, anon;
grant execute on function public.undo_import(uuid, boolean) to authenticated;
