-- SPARK V1 schema
-- Every table is owned by a user and protected by row-level security.
-- Child tables use composite foreign keys (parent_id, user_id) so a row can
-- never reference another user's parent row.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.idea_status as enum ('spark', 'exploring', 'parked', 'activated', 'archived');
create type public.idea_source as enum ('text', 'voice');
create type public.entry_kind as enum ('note', 'ai_challenge', 'status_change');
create type public.project_status as enum ('active', 'paused', 'done');

-- ---------------------------------------------------------------------------
-- Ideas
-- ---------------------------------------------------------------------------
create table public.ideas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  original_body    text not null check (char_length(original_body) between 1 and 20000),
  status           public.idea_status not null default 'spark',
  source           public.idea_source not null default 'text',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_viewed_at   timestamptz,
  last_surfaced_at timestamptz,
  search           tsvector generated always as (
                     to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(original_body, ''))
                   ) stored,
  unique (id, user_id)
);

create index ideas_user_created_idx on public.ideas (user_id, created_at desc);
create index ideas_user_status_idx on public.ideas (user_id, status);
create index ideas_search_idx on public.ideas using gin (search);

-- The original text is write-once. Ownership and creation time never change.
create function public.ideas_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.original_body is distinct from old.original_body then
    raise exception 'original_body is immutable';
  end if;
  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'user_id and created_at are immutable';
  end if;
  -- Only meaningful edits count as "touched"; views and resurfacing do not.
  if new.title is distinct from old.title or new.status is distinct from old.status then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

create trigger ideas_before_update
  before update on public.ideas
  for each row execute function public.ideas_before_update();

-- ---------------------------------------------------------------------------
-- Idea timeline (append-only)
-- ---------------------------------------------------------------------------
create table public.idea_entries (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null,
  user_id    uuid not null default auth.uid(),
  kind       public.entry_kind not null,
  body       text check (body is null or char_length(body) <= 10000),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (idea_id, user_id) references public.ideas (id, user_id) on delete cascade
);

create index idea_entries_idea_idx on public.idea_entries (idea_id, created_at);

-- Record every status change on the timeline automatically.
create function public.ideas_after_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.idea_entries (idea_id, user_id, kind, data)
  values (new.id, new.user_id, 'status_change',
          jsonb_build_object('from', old.status, 'to', new.status));
  return null;
end;
$$;

create trigger ideas_after_status_change
  after update of status on public.ideas
  for each row
  when (old.status is distinct from new.status)
  execute function public.ideas_after_status_change();

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

create table public.idea_tags (
  idea_id uuid not null,
  tag_id  uuid not null,
  user_id uuid not null default auth.uid(),
  primary key (idea_id, tag_id),
  foreign key (idea_id, user_id) references public.ideas (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index idea_tags_tag_idx on public.idea_tags (tag_id);

-- ---------------------------------------------------------------------------
-- Projects, milestones, next actions
-- ---------------------------------------------------------------------------
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null unique,
  user_id    uuid not null default auth.uid(),
  name       text not null check (char_length(name) between 1 and 200),
  goal       text check (goal is null or char_length(goal) <= 500),
  status     public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (idea_id, user_id) references public.ideas (id, user_id) on delete cascade
);

create index projects_user_idx on public.projects (user_id, status);

create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  user_id      uuid not null default auth.uid(),
  title        text not null check (char_length(title) between 1 and 200),
  due_date     date,
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create index milestones_project_idx on public.milestones (project_id, position);

create table public.actions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null,
  milestone_id uuid,
  user_id      uuid not null default auth.uid(),
  title        text not null check (char_length(title) between 1 and 200),
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (milestone_id, user_id) references public.milestones (id, user_id) on delete set null (milestone_id)
);

create index actions_project_idx on public.actions (project_id, completed_at, position);

-- ---------------------------------------------------------------------------
-- AI usage log (quota + cost visibility)
-- ---------------------------------------------------------------------------
create table public.ai_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea_id       uuid,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now()
);

create index ai_requests_user_day_idx on public.ai_requests (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security: default deny, owner-only access
-- ---------------------------------------------------------------------------
alter table public.ideas        enable row level security;
alter table public.idea_entries enable row level security;
alter table public.tags         enable row level security;
alter table public.idea_tags    enable row level security;
alter table public.projects     enable row level security;
alter table public.milestones   enable row level security;
alter table public.actions      enable row level security;
alter table public.ai_requests  enable row level security;

-- Full CRUD for the owner on mutable tables.
create policy "own ideas"      on public.ideas      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tags"       on public.tags       for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own idea_tags"  on public.idea_tags  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own projects"   on public.projects   for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own milestones" on public.milestones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own actions"    on public.actions    for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Timeline entries are append-only: read and insert, never update.
-- (They are removed only when their idea is deleted, via cascade.)
create policy "read own entries"   on public.idea_entries for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own entries" on public.idea_entries for insert to authenticated
  with check (user_id = (select auth.uid()));

-- AI log: read and insert own rows only.
create policy "read own ai_requests"   on public.ai_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own ai_requests" on public.ai_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Signed-in users reach tables only through the policies above.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Belt and braces: anonymous users get nothing.
revoke all on all tables in schema public from anon;
