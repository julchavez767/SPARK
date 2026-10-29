-- SPARK: restore user data from an in-database snapshot schema.
--
-- Usage: replace spark_backup_20261029 below with the snapshot schema to restore from,
-- review, then run the whole file. It is all-or-nothing.
--
-- What it does:
--   * Re-adds every snapshot row that is missing from the live tables, in foreign-key order.
--   * Never overwrites or deletes a live row (ON CONFLICT DO NOTHING), so it is safe to run
--     after a partial loss: rows that still exist are left exactly as they are.
--   * Copies only the columns the snapshot and the live table have in common, skipping
--     generated columns, so it still works after later migrations add columns.
--   * Disables triggers for the transaction so restored rows keep their original timestamps
--     and no History entries are invented.
--   * Finishes by printing the snapshot manifest's fingerprints next to the live ones.
-- Requires: the accounts the rows belong to still exist in auth.users.
begin;
set local session_replication_role = replica;

do $$
declare
  v_schema constant text := 'spark_backup_20261029';
  v_table  text;
  v_cols   text;
  v_n      bigint;
begin
  foreach v_table in array array['categories', 'imports', 'items', 'item_links', 'tags', 'item_tags',
                                 'item_entries', 'milestones', 'actions', 'ai_requests'] loop
    if not exists (select 1 from information_schema.tables where table_schema = v_schema and table_name = v_table) then
      raise notice 'skip %: not in snapshot', v_table;
      continue;
    end if;
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_cols
    from information_schema.columns c
    join information_schema.columns s
      on s.table_schema = v_schema and s.table_name = v_table and s.column_name = c.column_name
    where c.table_schema = 'public' and c.table_name = v_table and c.is_generated = 'NEVER';
    execute format('insert into public.%I (%s) select %s from %I.%I on conflict do nothing',
                   v_table, v_cols, v_cols, v_schema, v_table);
    get diagnostics v_n = row_count;
    raise notice 'restored % missing rows into %', v_n, v_table;
  end loop;
end $$;

set local session_replication_role = origin;
commit;

-- Compare: every "live" fingerprint should equal the snapshot's (rows added since the
-- snapshot will make them differ; check those separately).
select 'snapshot' as source, items, links, entries, items_fp, links_fp, entries_fp, tags_fp
from spark_backup_20261029.manifest
union all
select 'live',
  (select count(*) from public.items), (select count(*) from public.item_links), (select count(*) from public.item_entries),
  (select md5(string_agg(concat_ws('|', id, type, status, title, original_body, created_at, updated_at, category_id, import_id), ',' order by id)) from public.items),
  (select md5(string_agg(concat_ws('|', a_id, b_id, created_at), ',' order by a_id, b_id)) from public.item_links),
  (select md5(string_agg(concat_ws('|', id, item_id, kind, body, occurred_on, import_id, created_at), ',' order by id)) from public.item_entries),
  (select md5(string_agg(concat_ws('|', item_id, tag_id), ',' order by item_id, tag_id)) from public.item_tags);
