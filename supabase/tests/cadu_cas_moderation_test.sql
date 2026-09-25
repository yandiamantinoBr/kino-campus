begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(23);

select extensions.ok(
  not has_function_privilege('anon',
    'public.kc_cadu_moderate_post_cas(uuid,uuid,jsonb,jsonb,text,uuid,text,jsonb,uuid)', 'execute')
  and not has_function_privilege('authenticated',
    'public.kc_cadu_moderate_post_cas(uuid,uuid,jsonb,jsonb,text,uuid,text,jsonb,uuid)', 'execute')
  and has_function_privilege('service_role',
    'public.kc_cadu_moderate_post_cas(uuid,uuid,jsonb,jsonb,text,uuid,text,jsonb,uuid)', 'execute'),
  'only service_role can invoke the CAS moderation RPC'
);
select extensions.ok(
  not (select prosecdef from pg_proc where oid =
    'public.kc_cadu_moderate_post_cas(uuid,uuid,jsonb,jsonb,text,uuid,text,jsonb,uuid)'::regprocedure),
  'the moderation RPC runs as invoker'
);

insert into auth.users(id, email)
values ('10000000-0000-4000-8000-000000000001', 'cadu-moderation-test@example.invalid');
insert into public.profiles(id, full_name)
values ('10000000-0000-4000-8000-000000000001', 'Cadu test');
insert into public.kc_trusted_publishers(user_id, label)
values ('10000000-0000-4000-8000-000000000001', 'local moderation test');
insert into public.posts(id, author_id, title, description, location, module, category,
  status, visibility, image_url, expires_at, metadata)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'ENBRA XXX 2026', 'Encontro em Cuiabá/MT', 'Cuiabá/MT', 'eventos', 'culturais',
  'published', 'public', 'https://example.invalid/enbra.jpg', now() + interval '30 days',
  '{"source_id":"ig:cfaadm:Dc1Fa4hCUqQ","source_url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/", "userTags":["UFG"]}'::jsonb
);
insert into public.post_media(id, post_id, url, is_cover, sort_order)
values ('30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'https://example.invalid/enbra.jpg', true, 0);
create function pg_temp.moderation_media() returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(pm) order by pm.id), '[]'::jsonb)
  from public.post_media pm where pm.post_id='20000000-0000-4000-8000-000000000001';
$$;

set local role service_role;
create temporary table moderation_before as
select jsonb_object_agg(key, value) as snapshot
from public.posts p, lateral jsonb_each(to_jsonb(p))
where p.id = '20000000-0000-4000-8000-000000000001'
  and key = any(array['id','author_id','created_at','title','description','price','location',
    'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
    'moderation_reason']);
create temporary table moderation_hide as
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', snapshot, pg_temp.moderation_media(),
  'hide', '40000000-0000-4000-8000-000000000001',
  'Fonte CFA em Cuiabá não demonstra relação com a UFG nem o público local.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/", "title":"ENBRA XXX 2026", "dates":"2026", "venue":"Cuiabá/MT"}]'::jsonb,
  null
) as receipt from moderation_before;
reset role;

select extensions.is((select receipt->>'code' from moderation_hide), 'MODERATION_APPLIED',
  'hide commits an explicit receipt');
select extensions.is((select status from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'hidden', 'the post is hidden rather than deleted');
select extensions.is((select visibility from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'public', 'visibility is preserved for exact rollback');
select extensions.is((select moderation_reason from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'audit-cadu-editorial:40000000-0000-4000-8000-000000000001',
  'audit reason prevents ordinary publisher reactivation');
select extensions.is((select count(*)::integer from public.post_media where post_id='20000000-0000-4000-8000-000000000001'),
  1, 'media association is retained');
select extensions.is((select count(*)::integer from public.audit_log where entity_id='20000000-0000-4000-8000-000000000001'
  and action='cadu_post_moderation_cas'), 1, 'hide has a durable audit event');

set local role service_role;
create temporary table moderation_conflict as
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', snapshot, pg_temp.moderation_media(),
  'hide', '40000000-0000-4000-8000-000000000002',
  'Segunda tentativa stale não pode alterar a publicação sob concorrência.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  null
) as receipt from moderation_before;
reset role;
select extensions.is((select receipt->>'code' from moderation_conflict), 'MODERATION_CONFLICT',
  'stale snapshot fails before any second write');

set local role service_role;
create temporary table moderation_hidden as
select jsonb_object_agg(key, value) as snapshot
from public.posts p, lateral jsonb_each(to_jsonb(p))
where p.id = '20000000-0000-4000-8000-000000000001'
  and key = any(array['id','author_id','created_at','title','description','price','location',
    'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
    'moderation_reason']);
create temporary table moderation_rollback as
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', snapshot, pg_temp.moderation_media(),
  'rollback', '50000000-0000-4000-8000-000000000001',
  'Revisão editorial confirmou que a ocultação deve ser revertida com CAS.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  '40000000-0000-4000-8000-000000000001'
) as receipt from moderation_hidden;
reset role;
select extensions.is((select receipt->>'code' from moderation_rollback), 'MODERATION_APPLIED',
  'rollback commits only against the last hide');
select extensions.is((select status from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'published', 'rollback restores the earlier status');
select extensions.is((select jsonb_array_length(metadata->'cadu_moderation_history') from public.posts
  where id='20000000-0000-4000-8000-000000000001'), 2,
  'both operations stay in the metadata history');
select extensions.is((select count(*)::integer from public.audit_log where entity_id='20000000-0000-4000-8000-000000000001'
  and action='cadu_post_moderation_cas'), 2, 'both operations stay in the audit table');
select extensions.is((select count(*)::integer from public.post_media where post_id='20000000-0000-4000-8000-000000000001'),
  1, 'rollback also preserves media association');

set local role service_role;
create temporary table moderation_before_second_hide as
select jsonb_object_agg(key, value) as snapshot
from public.posts p, lateral jsonb_each(to_jsonb(p))
where p.id = '20000000-0000-4000-8000-000000000001'
  and key = any(array['id','author_id','created_at','title','description','price','location',
    'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
    'moderation_reason']);
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', snapshot, pg_temp.moderation_media(),
  'hide', '40000000-0000-4000-8000-000000000003',
  'Nova revisão editorial local ainda indica baixa relevância para a comunidade.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  null
) from moderation_before_second_hide;
reset role;
select extensions.ok((select (metadata->'cadu_moderation_history'->-1->>'after_updated_at')::timestamptz = updated_at
  from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'hide records the trigger-written timestamp exactly');
select extensions.ok((select metadata->'cadu_moderation_history'->-1->'media' =
  (select jsonb_agg(to_jsonb(pm) order by pm.id) from public.post_media pm
   where pm.post_id='20000000-0000-4000-8000-000000000001')
  from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'hide records the complete locked media snapshot');

update public.posts set title = 'ENBRA alterado depois da ocultação'
where id='20000000-0000-4000-8000-000000000001';
set local role service_role;
create temporary table moderation_edited_title as
with snapshot as (
  select jsonb_object_agg(key, value) as expected
  from public.posts p, lateral jsonb_each(to_jsonb(p))
  where p.id='20000000-0000-4000-8000-000000000001'
    and key = any(array['id','author_id','created_at','title','description','price','location',
      'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
      'moderation_reason'])
)
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', expected, pg_temp.moderation_media(),
  'rollback', '50000000-0000-4000-8000-000000000005',
  'Edição após ocultação exige nova revisão antes de republicar o evento.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  '40000000-0000-4000-8000-000000000003'
) as receipt from snapshot;
reset role;
select extensions.is((select receipt->>'code' from moderation_edited_title),
  'MODERATION_ROLLBACK_BLOCKED', 'fresh CAS cannot republish after a title edit');
update public.posts set title = 'ENBRA XXX 2026'
where id='20000000-0000-4000-8000-000000000001';

update public.post_media set url = 'https://example.invalid/changed.jpg'
where id='30000000-0000-4000-8000-000000000001';
set local role service_role;
create temporary table moderation_edited_media as
with snapshot as (
  select jsonb_object_agg(key, value) as expected
  from public.posts p, lateral jsonb_each(to_jsonb(p))
  where p.id='20000000-0000-4000-8000-000000000001'
    and key = any(array['id','author_id','created_at','title','description','price','location',
      'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
      'moderation_reason'])
)
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', expected, pg_temp.moderation_media(),
  'rollback', '50000000-0000-4000-8000-000000000006',
  'Alteração de mídia após ocultação exige nova revisão antes de republicar.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  '40000000-0000-4000-8000-000000000003'
) as receipt from snapshot;
reset role;
select extensions.is((select receipt->>'code' from moderation_edited_media),
  'MODERATION_ROLLBACK_BLOCKED', 'fresh CAS cannot republish after a media edit');
update public.post_media set url = 'https://example.invalid/enbra.jpg'
where id='30000000-0000-4000-8000-000000000001';

insert into public.post_media(id, post_id, url, is_cover, sort_order)
values ('30000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001', 'https://example.invalid/gallery.jpg', false, 1);
set local role service_role;
create temporary table moderation_inserted_media as
with snapshot as (
  select jsonb_object_agg(key, value) as expected
  from public.posts p, lateral jsonb_each(to_jsonb(p))
  where p.id='20000000-0000-4000-8000-000000000001'
    and key = any(array['id','author_id','created_at','title','description','price','location',
      'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
      'moderation_reason'])
)
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', expected, pg_temp.moderation_media(),
  'rollback', '50000000-0000-4000-8000-000000000008',
  'Nova mídia após ocultação exige revisão antes de republicar o evento.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  '40000000-0000-4000-8000-000000000003'
) as receipt from snapshot;
reset role;
select extensions.is((select receipt->>'code' from moderation_inserted_media),
  'MODERATION_ROLLBACK_BLOCKED', 'fresh CAS cannot republish after a media insertion');
delete from public.post_media where id='30000000-0000-4000-8000-000000000002';

update public.posts set metadata = metadata || '{"editorial_note":"changed after hide"}'::jsonb
where id='20000000-0000-4000-8000-000000000001';
set local role service_role;
create temporary table moderation_edited_metadata as
with snapshot as (
  select jsonb_object_agg(key, value) as expected
  from public.posts p, lateral jsonb_each(to_jsonb(p))
  where p.id='20000000-0000-4000-8000-000000000001'
    and key = any(array['id','author_id','created_at','title','description','price','location',
      'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
      'moderation_reason'])
)
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', expected, pg_temp.moderation_media(),
  'rollback', '50000000-0000-4000-8000-000000000007',
  'Alteração dos metadados após ocultação exige revisão da republicação.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  '40000000-0000-4000-8000-000000000003'
) as receipt from snapshot;
reset role;
select extensions.is((select receipt->>'code' from moderation_edited_metadata),
  'MODERATION_ROLLBACK_BLOCKED', 'fresh CAS cannot republish after a metadata edit');
update public.posts set metadata = metadata - 'editorial_note'
where id='20000000-0000-4000-8000-000000000001';

update public.posts set expires_at = now() - interval '1 day'
where id = '20000000-0000-4000-8000-000000000001';
set local role service_role;
create temporary table moderation_expired_snapshot as
select jsonb_object_agg(key, value) as snapshot
from public.posts p, lateral jsonb_each(to_jsonb(p))
where p.id = '20000000-0000-4000-8000-000000000001'
  and key = any(array['id','author_id','created_at','title','description','price','location',
    'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
    'moderation_reason']);
create temporary table moderation_expired_rollback as
select public.kc_cadu_moderate_post_cas(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001', snapshot, pg_temp.moderation_media(),
  'rollback', '50000000-0000-4000-8000-000000000004',
  'Não reabrir evento cujo prazo de validade se esgotou durante a revisão.',
  '[{"url":"https://www.instagram.com/p/Dc1Fa4hCUqQ/"}]'::jsonb,
  '40000000-0000-4000-8000-000000000003'
) as receipt from moderation_expired_snapshot;
reset role;
select extensions.is((select receipt->>'code' from moderation_expired_rollback),
  'MODERATION_ROLLBACK_BLOCKED', 'expired rollback fails after the lock');
select extensions.is((select status from public.posts where id='20000000-0000-4000-8000-000000000001'),
  'hidden', 'expired rollback leaves post hidden');
select extensions.is((select count(*)::integer from public.audit_log where entity_id='20000000-0000-4000-8000-000000000001'
  and action='cadu_post_moderation_cas'), 3, 'blocked rollback creates no fourth audit event');

select * from extensions.finish();
rollback;
