begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(15);

select extensions.ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_cadu_replace_post_media(uuid,text[],jsonb)',
    'execute'
  ),
  'anonymous callers cannot replace Cadu media'
);
select extensions.ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_cadu_replace_post_media(uuid,text[],jsonb)',
    'execute'
  ),
  'authenticated callers cannot replace Cadu media directly'
);
select extensions.ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.kc_cadu_replace_post_media(uuid,text[],jsonb)',
    'execute'
  ),
  'service role can invoke the transactional replacement'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '2345582d-8bf7-4393-aa0d-f9953d0e02ca',
  'yan1nakamura+cadu.kinocampus@gmail.com',
  clock_timestamp()
);
insert into public.profiles (id, full_name, is_admin)
values ('2345582d-8bf7-4393-aa0d-f9953d0e02ca', 'Cadu Bot', true);

insert into public.posts (id, author_id, title, metadata, image_url)
values (
  '00000000-0000-4000-8000-000000000921',
  '2345582d-8bf7-4393-aa0d-f9953d0e02ca',
  'Cadu media transaction',
  '{"before":true}'::jsonb,
  'https://example.test/before.jpg'
);
insert into public.post_media (post_id, url, is_cover, sort_order)
values (
  '00000000-0000-4000-8000-000000000921',
  'https://example.test/before.jpg',
  true,
  0
);

select extensions.is(
  public.kc_cadu_replace_post_media(
    '00000000-0000-4000-8000-000000000921',
    array['https://example.test/cover.jpg', 'https://example.test/gallery.jpg'],
    '{"gallery_image_urls":["https://example.test/gallery.jpg"]}'::jsonb
  ) ->> 'image_count',
  '2',
  'replacement reports the committed media count'
);
select extensions.is(
  (select image_url from public.posts where id = '00000000-0000-4000-8000-000000000921'),
  'https://example.test/cover.jpg',
  'post cover is updated'
);
select extensions.is(
  (select metadata from public.posts where id = '00000000-0000-4000-8000-000000000921'),
  '{"gallery_image_urls":["https://example.test/gallery.jpg"]}'::jsonb,
  'post metadata is updated in the same transaction'
);
select extensions.is(
  (select count(*)::integer from public.post_media where post_id = '00000000-0000-4000-8000-000000000921'),
  2,
  'old media is replaced by the exact new set'
);
select extensions.is(
  (select count(*)::integer from public.post_media where post_id = '00000000-0000-4000-8000-000000000921' and is_cover),
  1,
  'replacement has exactly one cover'
);
select extensions.is(
  (select url from public.post_media where post_id = '00000000-0000-4000-8000-000000000921' and is_cover),
  'https://example.test/cover.jpg',
  'first URL is the canonical cover'
);
select extensions.is(
  (select array_agg(sort_order order by sort_order) from public.post_media where post_id = '00000000-0000-4000-8000-000000000921'),
  array[0, 1],
  'sort order is dense and deterministic'
);

select extensions.throws_ok(
  $$select public.kc_cadu_replace_post_media(
    '00000000-0000-4000-8000-000000000921',
    array['http://example.test/insecure.jpg'],
    '{}'::jsonb
  )$$,
  '22023',
  'IMAGE_URL_INVALID',
  'non-HTTPS media is rejected'
);
select extensions.throws_ok(
  $$select public.kc_cadu_replace_post_media(
    '00000000-0000-4000-8000-000000000921',
    array['https://example.test/a.jpg', 'https://example.test/a.jpg'],
    '{}'::jsonb
  )$$,
  '22023',
  'IMAGE_URL_DUPLICATE',
  'duplicate media is rejected before mutation'
);
select extensions.is(
  (select image_url from public.posts where id = '00000000-0000-4000-8000-000000000921'),
  'https://example.test/cover.jpg',
  'failed validation preserves the prior cover'
);
select extensions.is(
  (select count(*)::integer from public.post_media where post_id = '00000000-0000-4000-8000-000000000921'),
  2,
  'failed validation preserves the prior gallery'
);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000922', 'other@example.test');
insert into public.profiles (id, full_name)
values ('00000000-0000-4000-8000-000000000922', 'Other Author');
insert into public.posts (id, author_id, title)
values (
  '00000000-0000-4000-8000-000000000923',
  '00000000-0000-4000-8000-000000000922',
  'Non Cadu post'
);

select extensions.throws_ok(
  $$select public.kc_cadu_replace_post_media(
    '00000000-0000-4000-8000-000000000923',
    array['https://example.test/nope.jpg'],
    '{}'::jsonb
  )$$,
  '42501',
  'CADU_POST_REQUIRED',
  'the service helper cannot mutate another author post'
);

select * from extensions.finish();
rollback;
