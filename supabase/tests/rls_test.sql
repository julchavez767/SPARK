-- Run with: supabase test db   (requires the Supabase CLI and a local stack)
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@spark.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@spark.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- A creates one of each type, independently
insert into public.items (id, type, title, original_body) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'idea', 'Weekly digest', 'Weekly digest of ideas'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'project', 'Build digest', null),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'system', 'Newsletter', null);

select is(
  (select string_agg(status, ',' order by type) from public.items),
  'spark,active,running',
  'each type starts in its own default status'
);

select throws_ok(
  $$ update public.items set status = 'running' where type = 'idea' $$,
  '23514', null,
  'an idea cannot take a system status'
);

select throws_ok(
  $$ update public.items set original_body = 'rewritten' where type = 'idea' $$,
  'original_body is immutable',
  'original text is write-once'
);

-- Links are many-to-many: the idea links to both the project and the system
insert into public.item_links (a_id, b_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003');
select is((select count(*)::int from public.item_links), 3, 'any item can link to any number of others');

update public.items set status = 'exploring' where type = 'idea';
select is(
  (select count(*)::int from public.item_entries where kind = 'status_change'),
  1,
  'status change is recorded in history'
);

-- B cannot see or touch A's items or links
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.items), 0, 'B cannot see A''s items');
select is((select count(*)::int from public.item_links), 0, 'B cannot see A''s links');

insert into public.items (id, type, title) values ('bbbbbbbb-0000-0000-0000-000000000001', 'system', 'B system');
select throws_ok(
  $$ insert into public.item_links (a_id, b_id) values
     ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001') $$,
  '23503', null,
  'B cannot link to A''s item'
);

select * from finish();
rollback;
