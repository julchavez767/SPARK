-- SPARK Sprint 1, Checkpoint A: foundation for Intelligent Capture.
--
-- Additive. No existing row is rewritten. What it adds:
--   * items.summary            an editable summary beside the write-once original text
--   * analysis_runs            one row per AI analysis: a durable job record and the usage/cost ledger
--   * suggestions              Needs Attention: one row per proposed change, grouped by item
--   * type changes             possible ONLY through an approved suggestion; logged as one
--                              'type_change' History entry with the old and new status
--   * History kinds            'type_change' and 'suggestion_applied'
--
-- Who can do what:
--   * Signed-in users can READ their own runs and suggestions (row-level security) and call
--     request_analysis, recover_analyses and apply_suggestions, which act only on their own rows.
--   * Only the server's service role can claim a run, record that the AI was called, and record
--     results, usage and cost (claim_analysis, mark_api_called, complete_analysis, fail_analysis).
--     So the browser can never forge suggestions or lower its recorded usage to dodge the limits.
--   * Nothing here changes an item. Items change only in apply_suggestions, for suggestions the
--     user explicitly accepts, in one transaction, at most once per suggestion.
--
-- Pilot limits (constants below; changed only by a reviewed migration):
--   50 analyses per user per rolling 24 hours, $10.00 per user per calendar month (UTC).

-- ---------------------------------------------------------------------------
-- 1. Editable summary
-- ---------------------------------------------------------------------------
alter table public.items
  add column summary text check (summary is null or char_length(btrim(summary)) between 1 and 2000);

-- ---------------------------------------------------------------------------
-- 2. Type changes: still blocked everywhere except inside apply_suggestions.
--    Summary and type edits count as "touched" (protects the item from import undo).
-- ---------------------------------------------------------------------------
create or replace function public.items_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.original_body is not null and new.original_body is distinct from old.original_body then
    raise exception 'original_body is immutable';
  end if;
  -- The only way past this check is apply_suggestions, which sets this transaction-local flag
  -- to the item's id for the one update that changes the type.
  if new.type is distinct from old.type
     and coalesce(current_setting('spark.type_change', true), '') <> old.id::text then
    raise exception 'type is immutable';
  end if;
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'user_id and created_at are immutable';
  end if;
  if new.title       is distinct from old.title
  or new.status      is distinct from old.status
  or new.type        is distinct from old.type
  or new.summary     is distinct from old.summary
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

-- A type change logs ONE entry (type + status), not a separate status entry.
-- Behaviour is unchanged for every status change that keeps the type.
drop trigger items_after_status_change on public.items;
create trigger items_after_status_change
  after update of status on public.items
  for each row
  when (old.status is distinct from new.status and old.type = new.type)
  execute function public.items_after_status_change();

create function public.items_after_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.item_entries (item_id, user_id, kind, data)
  values (new.id, new.user_id, 'type_change',
          jsonb_build_object('from_type', old.type, 'to_type', new.type,
                             'from_status', old.status, 'to_status', new.status));
  return null;
end;
$$;

revoke all on function public.items_after_type_change() from public, anon, authenticated;

create trigger items_after_type_change
  after update of type on public.items
  for each row
  when (old.type is distinct from new.type)
  execute function public.items_after_type_change();

alter table public.item_entries drop constraint item_entries_kind_check;
alter table public.item_entries add constraint item_entries_kind_check
  check (kind in (
    'note', 'hypothesis', 'challenge', 'decision', 'lesson',   -- Reasoning Log (written by the user)
    'ai_challenge',                                            -- reserved for future AI guidance
    'status_change', 'link_removed',                           -- automatic History
    'type_change', 'suggestion_applied'                        -- automatic History (Sprint 1)
  ));

-- ---------------------------------------------------------------------------
-- 3. analysis_runs: durable job + usage ledger
-- ---------------------------------------------------------------------------
create table public.analysis_runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  item_id            uuid not null,
  trigger            text not null check (trigger in ('capture', 'reanalysis', 'retry')),
  idempotency_key    text not null check (char_length(idempotency_key) between 1 and 200),
  status             text not null default 'queued'
                       check (status in ('queued', 'running', 'succeeded', 'failed', 'blocked')),
  blocked_reason     text check (blocked_reason is null or blocked_reason in ('daily_limit', 'monthly_budget')),
  attempts           integer not null default 0,
  lease_until        timestamptz,
  api_called_at      timestamptz,
  model              text check (model is null or char_length(model) <= 100),
  prompt_version     text check (prompt_version is null or char_length(prompt_version) <= 50),
  input_tokens       integer not null default 0 check (input_tokens >= 0),
  output_tokens      integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd           numeric(12, 6) not null default 0 check (cost_usd >= 0),
  suggestion_count   integer not null default 0,
  error_code         text check (error_code is null or char_length(error_code) <= 60),
  error_message      text check (error_message is null or char_length(error_message) <= 500),
  created_at         timestamptz not null default now(),
  started_at         timestamptz,
  finished_at        timestamptz,
  unique (id, user_id),
  unique (user_id, idempotency_key),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

-- At most one queued or running analysis per item: no duplicate analyses.
create unique index analysis_runs_one_active_idx on public.analysis_runs (item_id)
  where status in ('queued', 'running');
create index analysis_runs_user_created_idx on public.analysis_runs (user_id, created_at desc);
create index analysis_runs_item_idx on public.analysis_runs (item_id, created_at desc);

alter table public.analysis_runs enable row level security;
create policy "read own analysis runs" on public.analysis_runs for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate, references, trigger on public.analysis_runs from anon, authenticated;
revoke all on public.analysis_runs from anon;

-- ---------------------------------------------------------------------------
-- 4. suggestions: Needs Attention
-- ---------------------------------------------------------------------------
create table public.suggestions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  item_id      uuid not null,
  run_id       uuid not null,
  field        text not null check (field in ('title', 'summary', 'type', 'category', 'tag', 'link')),
  proposed     jsonb not null,
  value_key    text not null check (char_length(value_key) between 1 and 300),
  rationale    text check (rationale is null or char_length(rationale) <= 400),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'edited', 'dismissed', 'superseded')),
  applied      jsonb,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade,
  foreign key (run_id, user_id) references public.analysis_runs (id, user_id) on delete cascade
);

-- The same proposal can't be pending twice for an item.
create unique index suggestions_one_pending_idx on public.suggestions (item_id, field, value_key)
  where status = 'pending';
create index suggestions_user_status_idx on public.suggestions (user_id, status, created_at desc);
create index suggestions_item_idx on public.suggestions (item_id, status);

alter table public.suggestions enable row level security;
create policy "read own suggestions" on public.suggestions for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate, references, trigger on public.suggestions from anon, authenticated;
revoke all on public.suggestions from anon;

-- ---------------------------------------------------------------------------
-- 5. request_analysis (signed-in user): queue an analysis, idempotently, within limits.
--    Returns the run. Never calls the AI itself.
-- ---------------------------------------------------------------------------
create function public.request_analysis(p_item uuid, p_trigger text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_run     public.analysis_runs;
  v_daily   integer;
  v_month   numeric;
  v_reason  text;
  c_daily   constant integer := 50;
  c_monthly constant numeric := 10.00;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_trigger not in ('capture', 'reanalysis', 'retry') then raise exception 'invalid trigger'; end if;
  if p_key is null or char_length(p_key) not between 1 and 200 then raise exception 'invalid key'; end if;
  if not exists (select 1 from public.items where id = p_item and user_id = v_uid) then
    raise exception 'item not found';
  end if;

  -- Same request again (refresh, double submit, retry of the same call): same run.
  select * into v_run from public.analysis_runs where user_id = v_uid and idempotency_key = p_key;
  if found then return to_jsonb(v_run); end if;

  -- Already analysing this item: return that run instead of starting a second one.
  select * into v_run from public.analysis_runs
  where item_id = p_item and user_id = v_uid and status in ('queued', 'running');
  if found then return to_jsonb(v_run); end if;

  -- Limits. In-flight runs count toward the daily limit so a burst can't slip past it.
  select count(*) into v_daily from public.analysis_runs
  where user_id = v_uid
    and (api_called_at > now() - interval '24 hours'
         or (status in ('queued', 'running') and created_at > now() - interval '24 hours'));
  select coalesce(sum(cost_usd), 0) into v_month from public.analysis_runs
  where user_id = v_uid
    and api_called_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');

  v_reason := case
    when v_daily >= c_daily then 'daily_limit'
    when v_month >= c_monthly then 'monthly_budget'
  end;

  insert into public.analysis_runs (user_id, item_id, trigger, idempotency_key, status, blocked_reason, finished_at)
  values (v_uid, p_item, p_trigger, p_key,
          case when v_reason is null then 'queued' else 'blocked' end,
          v_reason,
          case when v_reason is null then null else now() end)
  returning * into v_run;

  return to_jsonb(v_run);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. recover_analyses (signed-in user): finish what an interrupted server left behind.
--    A run whose worker vanished before calling the AI goes back to the queue (no charge
--    happened). One that vanished after calling the AI is marked failed, never silently
--    re-run, because that call may already have been charged. Returns the user's queued runs.
-- ---------------------------------------------------------------------------
create function public.recover_analyses()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  update public.analysis_runs
  set status = 'queued', lease_until = null
  where user_id = v_uid and status = 'running' and lease_until < now() and api_called_at is null;

  update public.analysis_runs
  set status = 'failed', lease_until = null, finished_at = now(),
      error_code = 'interrupted', error_message = 'The analysis was interrupted. Retry when you like.'
  where user_id = v_uid and status = 'running' and lease_until < now() and api_called_at is not null;

  return query
    select id from public.analysis_runs
    where user_id = v_uid and status = 'queued'
    order by created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Server-only steps of a run (service role).
-- ---------------------------------------------------------------------------

-- Claim a queued run (or one whose worker vanished before calling the AI). Atomic: two
-- workers can't both claim it. At most 3 attempts, none of which follow a paid call.
create function public.claim_analysis(p_run uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.analysis_runs;
begin
  update public.analysis_runs
  set status = 'running', attempts = attempts + 1,
      lease_until = now() + interval '3 minutes',
      started_at = coalesce(started_at, now())
  where id = p_run
    and attempts < 3
    and (status = 'queued' or (status = 'running' and lease_until < now() and api_called_at is null))
  returning * into v_run;
  if not found then return null; end if;
  return to_jsonb(v_run);
end;
$$;

-- Record the moment just before the paid call. After this, the run is never re-run automatically.
create function public.mark_api_called(p_run uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.analysis_runs
  set api_called_at = now(), lease_until = now() + interval '3 minutes'
  where id = p_run and status = 'running' and api_called_at is null;
  return found;
end;
$$;

-- Record the result. Every proposal is checked here against the run's owner: ownership,
-- allowed values, no-ops, things the user already dismissed. Invalid ones are skipped and
-- reported, never stored. Re-analysis supersedes the item's older pending suggestions.
-- p_proposals: [{field, value, rationale}] where value is
--   title/summary: {"text": "..."}
--   type:          {"type": "project", "status": "planned" | null}
--   category:      {"category_id": "<uuid>"} or {"name": "New name"}
--   tag:           {"name": "..."}
--   link:          {"item_id": "<uuid>"}
create function public.complete_analysis(
  p_run uuid, p_model text, p_prompt_version text, p_usage jsonb, p_cost numeric, p_proposals jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run      public.analysis_runs;
  v_item     public.items;
  v_uid      uuid;
  r          jsonb;
  v_field    text;
  v_value    jsonb;
  v_key      text;
  v_text     text;
  v_id       uuid;
  v_status   text;
  v_skipped  jsonb := '[]'::jsonb;
  v_count    integer := 0;
  v_n        integer;
  v_single   text[] := '{}';   -- single-value fields already proposed in this run
  v_tags     integer := 0;
  v_links    integer := 0;
begin
  select * into v_run from public.analysis_runs where id = p_run for update;
  if not found then raise exception 'run not found'; end if;
  if v_run.status = 'succeeded' then
    return jsonb_build_object('already_completed', true, 'inserted', v_run.suggestion_count);
  end if;
  if v_run.status <> 'running' then raise exception 'run is not running'; end if;

  v_uid := v_run.user_id;
  select * into v_item from public.items where id = v_run.item_id and user_id = v_uid;
  if not found then raise exception 'item not found'; end if;

  -- Re-analysis replaces the item's earlier pending suggestions (kept, marked superseded).
  update public.suggestions set status = 'superseded', resolved_at = now()
  where item_id = v_item.id and user_id = v_uid and status = 'pending';

  if jsonb_typeof(p_proposals) = 'array' then
    for r in select value from jsonb_array_elements(p_proposals) limit 30 loop
      v_field := r->>'field';
      v_value := r->'value';
      v_key := null;

      if v_field = 'title' then
        v_text := btrim(regexp_replace(coalesce(v_value->>'text', ''), '\s+', ' ', 'g'));
        if char_length(v_text) between 1 and 200 and v_text is distinct from v_item.title then
          v_value := jsonb_build_object('text', v_text);
          v_key := lower(v_text);
        end if;

      elsif v_field = 'summary' then
        v_text := btrim(coalesce(v_value->>'text', ''));
        if char_length(v_text) between 1 and 2000 and v_text is distinct from v_item.summary then
          v_value := jsonb_build_object('text', v_text);
          v_key := md5(lower(v_text));
        end if;

      elsif v_field = 'type' then
        v_text := v_value->>'type';
        v_status := v_value->>'status';
        if v_text in ('idea', 'project', 'system') and v_text <> v_item.type then
          -- A proposed status is only a starting point; the user must confirm one when applying.
          if v_status is not null and not (
               (v_text = 'idea'    and v_status in ('spark', 'exploring', 'parked', 'archived'))
            or (v_text = 'project' and v_status in ('planned', 'active', 'paused', 'done', 'archived'))
            or (v_text = 'system'  and v_status in ('running', 'needs_attention', 'retired'))) then
            v_status := null;
          end if;
          v_value := jsonb_build_object('type', v_text, 'status', v_status);
          v_key := v_text;
        end if;

      elsif v_field = 'category' then
        v_id := null;
        if v_value ? 'category_id' then
          begin
            v_id := (v_value->>'category_id')::uuid;
          exception when others then
            v_id := null;
          end;
          if v_id is not null and exists (select 1 from public.categories where id = v_id and user_id = v_uid)
             and v_id is distinct from v_item.category_id then
            v_value := jsonb_build_object('category_id', v_id);
            v_key := 'id:' || v_id;
          end if;
        else
          v_text := btrim(regexp_replace(coalesce(v_value->>'name', ''), '\s+', ' ', 'g'));
          if char_length(v_text) between 1 and 60 then
            -- A "new" name that already exists becomes that existing category.
            select id into v_id from public.categories where user_id = v_uid and lower(name) = lower(v_text);
            if v_id is not null then
              if v_id is distinct from v_item.category_id then
                v_value := jsonb_build_object('category_id', v_id);
                v_key := 'id:' || v_id;
              end if;
            else
              v_value := jsonb_build_object('name', v_text);
              v_key := 'new:' || lower(v_text);
            end if;
          end if;
        end if;

      elsif v_field = 'tag' then
        v_text := btrim(regexp_replace(regexp_replace(coalesce(v_value->>'name', ''), '^#', ''), '\s+', ' ', 'g'));
        if char_length(v_text) between 1 and 40 and not exists (
             select 1 from public.item_tags it join public.tags t on t.id = it.tag_id
             where it.item_id = v_item.id and lower(t.name) = lower(v_text)) then
          v_value := jsonb_build_object('name', v_text,
                       'is_new', not exists (select 1 from public.tags where user_id = v_uid and lower(name) = lower(v_text)));
          v_key := lower(v_text);
        end if;

      elsif v_field = 'link' then
        v_id := null;
        begin
          v_id := (v_value->>'item_id')::uuid;
        exception when others then
          v_id := null;
        end;
        if v_id is not null and v_id <> v_item.id
           and exists (select 1 from public.items where id = v_id and user_id = v_uid)
           and not exists (select 1 from public.item_links
                           where a_id = least(v_id, v_item.id) and b_id = greatest(v_id, v_item.id)) then
          v_value := jsonb_build_object('item_id', v_id);
          v_key := v_id::text;
        end if;
      end if;

      if v_key is null then
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('field', v_field, 'reason', 'invalid, unchanged or not owned'));
        continue;
      end if;

      -- One proposal per single-value field, at most 5 tags and 5 links per analysis.
      if (v_field = any (array['title', 'summary', 'type', 'category']) and v_field = any (v_single))
         or (v_field = 'tag' and v_tags >= 5) or (v_field = 'link' and v_links >= 5) then
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('field', v_field, 'reason', 'over the per-analysis limit'));
        continue;
      end if;

      -- Don't nag: never re-propose something the user dismissed for this item.
      if exists (select 1 from public.suggestions
                 where item_id = v_item.id and field = v_field and value_key = v_key and status = 'dismissed') then
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('field', v_field, 'reason', 'previously dismissed'));
        continue;
      end if;

      insert into public.suggestions (user_id, item_id, run_id, field, proposed, value_key, rationale)
      values (v_uid, v_item.id, v_run.id, v_field, v_value, v_key,
              nullif(left(btrim(coalesce(r->>'rationale', '')), 400), ''))
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_count := v_count + v_n;
      if v_n > 0 then
        if v_field = any (array['title', 'summary', 'type', 'category']) then v_single := v_single || v_field; end if;
        if v_field = 'tag' then v_tags := v_tags + 1; end if;
        if v_field = 'link' then v_links := v_links + 1; end if;
      end if;
    end loop;
  end if;

  update public.analysis_runs
  set status = 'succeeded', finished_at = now(), lease_until = null,
      model = left(p_model, 100), prompt_version = left(p_prompt_version, 50),
      input_tokens = coalesce((p_usage->>'input_tokens')::integer, 0),
      output_tokens = coalesce((p_usage->>'output_tokens')::integer, 0),
      cache_read_tokens = coalesce((p_usage->>'cache_read_input_tokens')::integer, 0),
      cache_write_tokens = coalesce((p_usage->>'cache_creation_input_tokens')::integer, 0),
      cost_usd = greatest(coalesce(p_cost, 0), 0),
      suggestion_count = v_count
  where id = v_run.id;

  return jsonb_build_object('inserted', v_count, 'skipped', v_skipped);
end;
$$;

-- Record a failure (with any usage already charged). The user retries explicitly.
create function public.fail_analysis(p_run uuid, p_code text, p_message text, p_usage jsonb, p_cost numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.analysis_runs
  set status = 'failed', finished_at = now(), lease_until = null,
      error_code = left(coalesce(p_code, 'error'), 60),
      error_message = left(p_message, 500),
      input_tokens = coalesce((p_usage->>'input_tokens')::integer, input_tokens),
      output_tokens = coalesce((p_usage->>'output_tokens')::integer, output_tokens),
      cost_usd = greatest(coalesce(p_cost, cost_usd), 0)
  where id = p_run and status in ('queued', 'running');
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. apply_suggestions (signed-in user): accept, edit-and-accept or dismiss, in ONE transaction.
--    p_decisions: [{"id": "<suggestion id>", "action": "accept" | "dismiss", "value": {...} (optional edit)}]
--    A suggestion that is no longer pending is skipped (double taps, two tabs): applied once.
--    Type changes require the user to confirm the status in "value".
-- ---------------------------------------------------------------------------
create function public.apply_suggestions(p_item uuid, p_decisions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_item    public.items;
  d         jsonb;
  s         public.suggestions;
  v_val     jsonb;
  v_edited  boolean;
  v_text    text;
  v_type    text;
  v_status  text;
  v_id      uuid;
  v_from    jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    raise exception 'nothing to apply';
  end if;
  if jsonb_array_length(p_decisions) > 50 then raise exception 'too many decisions'; end if;

  select * into v_item from public.items where id = p_item and user_id = v_uid for update;
  if not found then raise exception 'item not found'; end if;

  for d in select value from jsonb_array_elements(p_decisions) loop
    select * into s from public.suggestions
    where id = (d->>'id')::uuid and user_id = v_uid and item_id = p_item
    for update;
    if not found then raise exception 'suggestion not found'; end if;

    if s.status <> 'pending' then
      v_results := v_results || jsonb_build_array(jsonb_build_object('id', s.id, 'result', 'already ' || s.status));
      continue;
    end if;

    if d->>'action' = 'dismiss' then
      update public.suggestions set status = 'dismissed', resolved_at = now() where id = s.id;
      v_results := v_results || jsonb_build_array(jsonb_build_object('id', s.id, 'result', 'dismissed'));
      continue;
    end if;
    if d->>'action' <> 'accept' then raise exception 'unknown action'; end if;

    v_val := coalesce(d->'value', s.proposed);
    v_edited := d ? 'value' and d->'value' is distinct from s.proposed;
    select * into v_item from public.items where id = p_item;  -- current values

    if s.field = 'title' then
      v_text := btrim(regexp_replace(coalesce(v_val->>'text', ''), '\s+', ' ', 'g'));
      if char_length(v_text) not between 1 and 200 then raise exception 'title must be 1 to 200 characters'; end if;
      v_from := to_jsonb(v_item.title);
      update public.items set title = v_text where id = p_item;
      v_val := jsonb_build_object('text', v_text);

    elsif s.field = 'summary' then
      v_text := btrim(coalesce(v_val->>'text', ''));
      if char_length(v_text) not between 1 and 2000 then raise exception 'summary must be 1 to 2,000 characters'; end if;
      v_from := to_jsonb(v_item.summary);
      update public.items set summary = v_text where id = p_item;
      v_val := jsonb_build_object('text', v_text);

    elsif s.field = 'type' then
      -- The user must confirm the new status; it is never assumed.
      if not (d ? 'value') or (d->'value'->>'status') is null then
        raise exception 'confirm the new status before changing the type';
      end if;
      v_type := v_val->>'type';
      v_status := v_val->>'status';
      if v_type not in ('idea', 'project', 'system') or v_type = v_item.type then raise exception 'invalid type'; end if;
      if not ((v_type = 'idea'    and v_status in ('spark', 'exploring', 'parked', 'archived'))
           or (v_type = 'project' and v_status in ('planned', 'active', 'paused', 'done', 'archived'))
           or (v_type = 'system'  and v_status in ('running', 'needs_attention', 'retired'))) then
        raise exception 'that status does not fit the new type';
      end if;
      v_from := jsonb_build_object('type', v_item.type, 'status', v_item.status);
      perform set_config('spark.type_change', p_item::text, true);
      update public.items
      set type = v_type, status = v_status,
          -- Ideas always keep original text; one without any gets its title, as quick-added ideas do.
          original_body = case when v_type = 'idea' and original_body is null then title else original_body end
      where id = p_item;
      perform set_config('spark.type_change', '', true);
      v_val := jsonb_build_object('type', v_type, 'status', v_status);
      -- Confirming a status the AI left open is not an edit; changing the type or a proposed status is.
      v_edited := v_type is distinct from s.proposed->>'type'
                  or ((s.proposed->>'status') is not null and v_status is distinct from s.proposed->>'status');

    elsif s.field = 'category' then
      v_from := to_jsonb(v_item.category_id);
      if v_val ? 'category_id' then
        v_id := (v_val->>'category_id')::uuid;
        if not exists (select 1 from public.categories where id = v_id and user_id = v_uid) then
          raise exception 'category not found';
        end if;
      else
        v_text := btrim(regexp_replace(coalesce(v_val->>'name', ''), '\s+', ' ', 'g'));
        if char_length(v_text) not between 1 and 60 then raise exception 'category name must be 1 to 60 characters'; end if;
        select id into v_id from public.categories where user_id = v_uid and lower(name) = lower(v_text);
        if v_id is null then
          insert into public.categories (user_id, name) values (v_uid, v_text) returning id into v_id;
        end if;
      end if;
      update public.items set category_id = v_id where id = p_item;
      v_val := jsonb_build_object('category_id', v_id);

    elsif s.field = 'tag' then
      v_text := btrim(regexp_replace(regexp_replace(coalesce(v_val->>'name', ''), '^#', ''), '\s+', ' ', 'g'));
      if char_length(v_text) not between 1 and 40 then raise exception 'tag must be 1 to 40 characters'; end if;
      select id into v_id from public.tags where user_id = v_uid and lower(name) = lower(v_text);
      if v_id is null then
        insert into public.tags (user_id, name) values (v_uid, v_text) returning id into v_id;
      end if;
      insert into public.item_tags (item_id, tag_id, user_id) values (p_item, v_id, v_uid) on conflict do nothing;
      v_from := null;
      v_val := jsonb_build_object('name', v_text, 'tag_id', v_id);

    elsif s.field = 'link' then
      v_id := (v_val->>'item_id')::uuid;
      if v_id = p_item or not exists (select 1 from public.items where id = v_id and user_id = v_uid) then
        raise exception 'linked item not found';
      end if;
      insert into public.item_links (a_id, b_id, user_id)
      values (least(p_item, v_id), greatest(p_item, v_id), v_uid)
      on conflict do nothing;
      v_from := null;
      v_val := jsonb_build_object('item_id', v_id,
                 'title', (select title from public.items where id = v_id));
    end if;

    update public.suggestions
    set status = case when v_edited then 'edited' else 'accepted' end,
        applied = v_val, resolved_at = now()
    where id = s.id;

    -- Type changes are logged by their own trigger; everything else gets one History line.
    if s.field <> 'type' then
      insert into public.item_entries (item_id, user_id, kind, data)
      values (p_item, v_uid, 'suggestion_applied',
              jsonb_build_object('field', s.field, 'from', v_from, 'to', v_val,
                                 'suggestion_id', s.id, 'edited', v_edited));
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id', s.id, 'result', case when v_edited then 'edited' else 'accepted' end));
  end loop;

  return jsonb_build_object('item_id', p_item, 'results', v_results);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.request_analysis(uuid, text, text) from public, anon;
revoke all on function public.recover_analyses() from public, anon;
revoke all on function public.apply_suggestions(uuid, jsonb) from public, anon;
grant execute on function public.request_analysis(uuid, text, text) to authenticated;
grant execute on function public.recover_analyses() to authenticated;
grant execute on function public.apply_suggestions(uuid, jsonb) to authenticated;

revoke all on function public.claim_analysis(uuid) from public, anon, authenticated;
revoke all on function public.mark_api_called(uuid) from public, anon, authenticated;
revoke all on function public.complete_analysis(uuid, text, text, jsonb, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.fail_analysis(uuid, text, text, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.claim_analysis(uuid) to service_role;
grant execute on function public.mark_api_called(uuid) to service_role;
grant execute on function public.complete_analysis(uuid, text, text, jsonb, numeric, jsonb) to service_role;
grant execute on function public.fail_analysis(uuid, text, text, jsonb, numeric) to service_role;
