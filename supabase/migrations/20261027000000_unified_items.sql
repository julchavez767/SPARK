-- SPARK: unified items with type, status and flexible links.
--
-- Every idea, project and system is one row in `items`:
--   type          what it is (idea | project | system); set at creation, never changes
--   status        where it stands; each type has its own small set of statuses
--   item_links    two-way relationships between any items, any number of them
--
-- Replaces the earlier ideas/projects tables (they held no data when this ran).

drop table if exists public.actions, public.milestones, public.projects,
  public.idea_tags, public.tags, public.idea_entries, public.ideas cascade;
drop function if exists public.ideas_before_update() cascade;
drop function if exists public.ideas_after_status_change() cascade;
drop type if exists public.idea_status, public.idea_source, public.entry_kind, public.project_status cascade;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------
create table public.items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type             text not null check (type in ('idea', 'project', 'system')),
  status           text not null,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  original_body    text check (original_body is null or char_length(original_body) between 1 and 20000),
  source           text not null default 'text' check (source in ('text', 'voice')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_viewed_at   timestamptz,
  last_surfaced_at timestamptz,
  search           tsvector generated always as (
                     to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(original_body, ''))
                   ) stored,
  unique (id, user_id),
  constraint idea_has_text check (type <> 'idea' or original_body is not null),
  constraint status_fits_type check (
       (type = 'idea'    and status in ('spark', 'exploring', 'parked', 'archived'))
    or (type = 'project' and status in ('planned', 'active', 'paused', 'done', 'archived'))
    or (type = 'system'  and status in ('running', 'needs_attention', 'retired'))
  )
);

create index items_user_created_idx on public.items (user_id, created_at desc);
create index items_user_type_status_idx on public.items (user_id, type, status);
create index items_search_idx on public.items using gin (search);

-- New items start in their type's first status unless one is given.
create function public.items_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is null then
    new.status := case new.type
      when 'idea' then 'spark'
      when 'project' then 'active'
      when 'system' then 'running'
    end;
  end if;
  return new;
end;
$$;

create trigger items_before_insert
  before insert on public.items
  for each row execute function public.items_before_insert();

-- Original text is write-once; type, owner and creation time never change.
create function public.items_before_update()
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
  if new.title is distinct from old.title or new.status is distinct from old.status then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger items_before_update
  before update on public.items
  for each row execute function public.items_before_update();

-- ---------------------------------------------------------------------------
-- Links: two-way, any type to any type, stored once per pair (a_id < b_id)
-- ---------------------------------------------------------------------------
create table public.item_links (
  a_id       uuid not null,
  b_id       uuid not null,
  user_id    uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (a_id, b_id),
  constraint ordered_pair check (a_id < b_id),
  foreign key (a_id, user_id) references public.items (id, user_id) on delete cascade,
  foreign key (b_id, user_id) references public.items (id, user_id) on delete cascade
);

create index item_links_b_idx on public.item_links (b_id);

-- ---------------------------------------------------------------------------
-- Timeline (append-only): notes, AI challenges, status changes
-- ---------------------------------------------------------------------------
create table public.item_entries (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null,
  user_id    uuid not null default auth.uid(),
  kind       text not null check (kind in ('note', 'ai_challenge', 'status_change')),
  body       text check (body is null or char_length(body) <= 10000),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

create index item_entries_item_idx on public.item_entries (item_id, created_at);

create function public.items_after_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.item_entries (item_id, user_id, kind, data)
  values (new.id, new.user_id, 'status_change', jsonb_build_object('from', old.status, 'to', new.status));
  return null;
end;
$$;

create trigger items_after_status_change
  after update of status on public.items
  for each row
  when (old.status is distinct from new.status)
  execute function public.items_after_status_change();

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.item_tags (
  item_id uuid not null,
  tag_id  uuid not null,
  user_id uuid not null default auth.uid(),
  primary key (item_id, tag_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index item_tags_tag_idx on public.item_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Milestones and next actions (used by projects, but any item may have them)
-- ---------------------------------------------------------------------------
create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null,
  user_id      uuid not null default auth.uid(),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  due_date     date,
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

create index milestones_item_idx on public.milestones (item_id, position);

create table public.actions (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null,
  milestone_id uuid,
  user_id      uuid not null default auth.uid(),
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade,
  foreign key (milestone_id, user_id) references public.milestones (id, user_id) on delete set null (milestone_id)
);

create index actions_item_idx on public.actions (item_id, completed_at, position);

-- ai_requests (from the first migration) now refers to items.
alter table public.ai_requests rename column idea_id to item_id;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.items        enable row level security;
alter table public.item_links   enable row level security;
alter table public.item_entries enable row level security;
alter table public.tags         enable row level security;
alter table public.item_tags    enable row level security;
alter table public.milestones   enable row level security;
alter table public.actions      enable row level security;

create policy "own items"      on public.items      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own links"      on public.item_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tags"       on public.tags       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own item_tags"  on public.item_tags  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own milestones" on public.milestones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own actions"    on public.actions    for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Timeline is append-only: read and insert, never update.
create policy "read own entries"   on public.item_entries for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own entries" on public.item_entries for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
