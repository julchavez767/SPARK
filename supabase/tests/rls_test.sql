-- Run with: supabase test db   (requires the Supabase CLI and a local stack)
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@spark.test'),
  ('22222222-2222-2222-2222-222222222222', 'b@spark.test');

-- User A captures an idea
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.ideas (title, original_body) values ('A first idea', 'The original words');

select is((select count(*)::int from public.ideas), 1, 'A sees their own idea');

select throws_ok(
  $$ update public.ideas set original_body = 'rewritten' $$,
  'original_body is immutable',
  'original text is write-once'
);

update public.ideas set status = 'exploring';
select is(
  (select count(*)::int from public.idea_entries where kind = 'status_change'),
  1,
  'status change is recorded on the timeline'
);

-- User B tries to see and change A's idea
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.ideas), 0, 'B cannot see A''s ideas');
update public.ideas set title = 'hacked';

select throws_ok(
  $$ insert into public.ideas (user_id, title, original_body)
     values ('11111111-1111-1111-1111-111111111111', 'planted', 'x') $$,
  '42501',
  null,
  'B cannot create an idea owned by A'
);

-- Back to A: the title is untouched
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select title from public.ideas limit 1), 'A first idea', 'B''s update changed nothing');

select * from finish();
rollback;
