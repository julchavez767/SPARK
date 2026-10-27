-- SPARK: write an import in one transaction. Insert-only: it never updates or
-- deletes an existing item. It runs as the caller (security invoker), so every
-- insert is checked by the same row-level security as the rest of the app.
--
-- p_items: [{ key, type, title, description, status, category, tags[],
--             source_name, source_url, origin, created }]
-- p_links: [{ a, b }] where each side is a row key from p_items or the id of an
--          item the user already owns.

create function public.import_items(p_file_name text, p_items jsonb, p_links jsonb)
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
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'nothing to import';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'too many items in one import (limit 1000)';
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

  update public.imports set item_count = v_items, link_count = v_links where id = v_import;

  return jsonb_build_object('import_id', v_import, 'items', v_items, 'links', v_links);
end;
$$;

revoke all on function public.import_items(text, jsonb, jsonb) from public, anon;
grant execute on function public.import_items(text, jsonb, jsonb) to authenticated;
