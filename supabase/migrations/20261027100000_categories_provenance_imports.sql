-- SPARK: categories, idea origins, and import tracking.
-- Additive only: new tables, new nullable columns, new indexes.
-- No existing row is updated or deleted by this migration.

-- ---------------------------------------------------------------------------
-- Categories: user-defined, renameable, one per item
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index categories_user_name_idx on public.categories (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Import history
-- ---------------------------------------------------------------------------
create table public.imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name     text check (file_name is null or char_length(file_name) <= 200),
  item_count    integer not null default 0,
  link_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  undone_at     timestamptz,
  removed_count integer not null default 0,
  unique (id, user_id)
);

create index imports_user_created_idx on public.imports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- New optional item fields (existing rows get NULL; nothing else changes)
-- ---------------------------------------------------------------------------
alter table public.items
  add column category_id uuid,
  add column source_name text check (source_name is null or char_length(btrim(source_name)) between 1 and 100),
  add column source_url  text check (source_url is null or (char_length(source_url) <= 2000 and source_url ~* '^https?://')),
  add column origin      text check (origin is null or origin in ('mine', 'co_developed', 'suggested')),
  add column import_id   uuid;

alter table public.items
  add constraint items_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id),
  add constraint items_import_fk foreign key (import_id, user_id)
    references public.imports (id, user_id) on delete set null (import_id);

create index items_user_category_idx on public.items (user_id, category_id);
create index items_user_updated_idx  on public.items (user_id, updated_at desc);
create index items_user_title_idx    on public.items (user_id, lower(title));
create index items_import_idx        on public.items (import_id) where import_id is not null;

-- When a tag was attached (used to protect edited items on undo).
alter table public.item_tags add column created_at timestamptz not null default now();

-- Edits to the new fields count as "touched", like title and status.
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

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.imports    enable row level security;

create policy "own categories" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Import history is kept: read, create and update own rows; no delete.
create policy "read own imports"   on public.imports for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own imports" on public.imports for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own imports" on public.imports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update on public.imports to authenticated;
revoke all on public.categories, public.imports from anon;
