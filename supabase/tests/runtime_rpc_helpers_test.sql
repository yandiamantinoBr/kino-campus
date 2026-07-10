begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(39);

select extensions.ok(to_regprocedure('kc_private.kc_insert_audit_log(text,text,uuid,jsonb,uuid)') is not null, 'private audit helper exists');
select extensions.ok(to_regprocedure('kc_private.kc_resolve_post_flood_limit(uuid,text)') is not null, 'private flood limit resolver exists');
select extensions.ok(to_regprocedure('kc_private.kc_compute_post_flood_check(uuid,text)') is not null, 'private flood limit calculator exists');
select extensions.ok(to_regprocedure('kc_private.kc_chat_is_new_user(uuid)') is not null, 'private chat age helper exists');
select extensions.ok(to_regprocedure('kc_private.kc_check_duplicate_post(uuid,text,text,double precision)') is not null, 'private duplicate checker exists');
select extensions.ok(to_regprocedure('kc_private.kc_admin_list_posts_by_ids(uuid[])') is not null, 'private admin post lookup exists');
select extensions.ok(to_regprocedure('kc_private.kc_admin_search_posts_full(text,text,integer,integer)') is not null, 'private admin post search exists');
select extensions.ok(to_regprocedure('kc_private.kc_admin_revoke_invite(text)') is not null, 'private invite revoke helper exists');
select extensions.ok(to_regprocedure('public.kc_admin_list_posts_by_ids(uuid[])') is not null, 'public admin post lookup exists');
select extensions.ok(to_regprocedure('public.kc_admin_search_posts_full(text,text,integer,integer)') is not null, 'public admin post search exists');
select extensions.ok(to_regprocedure('public.kc_check_duplicate_post(uuid,text,text,double precision)') is not null, 'public duplicate checker exists');

select extensions.ok(not has_function_privilege('anon', 'public.kc_check_duplicate_post(uuid,text,text,double precision)', 'execute'), 'anon cannot call duplicate checker');
select extensions.ok(has_function_privilege('authenticated', 'public.kc_check_duplicate_post(uuid,text,text,double precision)', 'execute'), 'authenticated can call duplicate checker');
select extensions.ok(not has_function_privilege('anon', 'public.kc_admin_list_posts_by_ids(uuid[])', 'execute'), 'anon cannot call admin post lookup');
select extensions.ok(has_function_privilege('authenticated', 'public.kc_admin_list_posts_by_ids(uuid[])', 'execute'), 'authenticated can reach admin lookup authorization');

select extensions.ok(not (select prosecdef from pg_proc where oid = 'public.kc_check_duplicate_post(uuid,text,text,double precision)'::regprocedure), 'public duplicate checker is invoker');
select extensions.ok(not (select prosecdef from pg_proc where oid = 'public.kc_admin_list_posts_by_ids(uuid[])'::regprocedure), 'public admin lookup is invoker');
select extensions.ok(not (select prosecdef from pg_proc where oid = 'public.kc_admin_search_posts_full(text,text,integer,integer)'::regprocedure), 'public admin search is invoker');
select extensions.ok(not (select prosecdef from pg_proc where oid = 'public.kc_admin_revoke_invite(text)'::regprocedure), 'public invite revoke is invoker');
select extensions.ok((select prosecdef from pg_proc where oid = 'kc_private.kc_check_duplicate_post(uuid,text,text,double precision)'::regprocedure), 'private duplicate checker is definer');
select extensions.ok((select prosecdef from pg_proc where oid = 'kc_private.kc_admin_list_posts_by_ids(uuid[])'::regprocedure), 'private admin lookup is definer');
select extensions.ok((select prosecdef from pg_proc where oid = 'kc_private.kc_admin_search_posts_full(text,text,integer,integer)'::regprocedure), 'private admin search is definer');
select extensions.ok((select prosecdef from pg_proc where oid = 'kc_private.kc_admin_revoke_invite(text)'::regprocedure), 'private invite revoke is definer');

select extensions.ok(
  (select prosrc like '%extensions.similarity%' from pg_proc where oid = 'kc_private.kc_check_duplicate_post(uuid,text,text,double precision)'::regprocedure),
  'duplicate checker schema-qualifies pg_trgm similarity'
);
select extensions.ok(
  (select prosrc like '%extensions.hmac%' from pg_proc where oid = 'public.notify_admin_if_reports_threshold(uuid)'::regprocedure),
  'report notification schema-qualifies pgcrypto hmac'
);
select extensions.ok(
  (select prosrc not like '%p.titulo%' from pg_proc where oid = 'kc_private.kc_admin_list_posts_by_ids(uuid[])'::regprocedure),
  'admin post lookup does not reference removed titulo column'
);
select extensions.ok(
  (select prosrc not like '%p.content%' from pg_proc where oid = 'kc_private.kc_admin_search_posts_full(text,text,integer,integer)'::regprocedure),
  'admin post search does not reference removed content column'
);
select extensions.ok(
  (select prosrc like '%gen_random_uuid()%' from pg_proc where oid = 'kc_private.kc_admin_revoke_invite(text)'::regprocedure),
  'invite revoke uses a UUID audit entity id'
);
select extensions.ok(not has_function_privilege('authenticated', 'public.notify_admin_if_reports_threshold(uuid)', 'execute'), 'authenticated cannot call report notification directly');
select extensions.ok(has_function_privilege('service_role', 'public.notify_admin_if_reports_threshold(uuid)', 'execute'), 'service role can execute report notification');

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000222', 'rpc-helper-admin@example.test');
insert into public.profiles (id, is_admin, full_name)
values ('00000000-0000-4000-8000-000000000222', true, 'RPC Helper Admin');

set local session_replication_role = replica;
insert into public.posts (id, author_id, title, description, module, category, status)
values (
  '00000000-0000-4000-8000-000000000333',
  '00000000-0000-4000-8000-000000000222',
  'Evento de teste duplicado',
  'Descricao pesquisavel para o contrato de runtime.',
  'eventos',
  'academicos',
  'published'
);
set local session_replication_role = origin;

insert into public.kc_invited_emails (email, invited_by, note)
values ('invite-to-revoke@example.test', '00000000-0000-4000-8000-000000000222', 'pgTAP');

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000222","role":"authenticated"}',
  true
);
set local role authenticated;

select extensions.is(
  jsonb_array_length((public.kc_check_duplicate_post(
    '00000000-0000-4000-8000-000000000222',
    'eventos',
    'Evento de teste duplicado',
    0.45
  ))->'candidates'),
  1,
  'duplicate checker returns the matching own post'
);
select extensions.is(
  (select title from public.kc_admin_list_posts_by_ids(array['00000000-0000-4000-8000-000000000333'::uuid]) limit 1),
  'Evento de teste duplicado',
  'admin post lookup returns title from the active schema'
);
select extensions.is(
  (select content from public.kc_admin_search_posts_full('pesquisavel', null, 25, 0) limit 1),
  'Descricao pesquisavel para o contrato de runtime.',
  'admin post search maps description to its content contract'
);
select extensions.is(
  (public.kc_admin_revoke_invite('invite-to-revoke@example.test')->>'deleted_count')::integer,
  1,
  'admin invite revoke removes one invite'
);
select extensions.is(
  (public.kc_check_post_flood_limit('00000000-0000-4000-8000-000000000222', 'eventos')->>'ok')::boolean,
  true,
  'post flood check reaches the restored private helpers'
);

reset role;

select extensions.is(
  (select count(*)::integer from public.kc_invited_emails where email = 'invite-to-revoke@example.test'),
  0,
  'revoked invite no longer exists'
);
select extensions.is(
  (select count(*)::integer from public.audit_log where action = 'invite_revoked' and entity_type = 'invites'),
  1,
  'invite revoke writes one audit event'
);
select extensions.ok(
  (select entity_id is not null from public.audit_log where action = 'invite_revoked' and entity_type = 'invites' limit 1),
  'invite audit event stores a valid UUID entity id'
);
select extensions.is(
  (select payload->>'email' from public.audit_log where action = 'invite_revoked' and entity_type = 'invites' limit 1),
  'invite-to-revoke@example.test',
  'invite audit payload retains the reviewed email'
);

select * from extensions.finish();

rollback;
