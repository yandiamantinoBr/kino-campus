begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000801', 'erase-target@example.test'),
  ('00000000-0000-4000-8000-000000000802', 'erase-survivor@example.test'),
  ('00000000-0000-4000-8000-000000000803', 'erase-outsider@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  ('00000000-0000-4000-8000-000000000801', 'erase-target@example.test', 'Erase Target', false),
  ('00000000-0000-4000-8000-000000000802', 'erase-survivor@example.test', 'Erase Survivor', false),
  ('00000000-0000-4000-8000-000000000803', 'erase-outsider@example.test', 'Erase Outsider', false);

insert into auth.sessions (id, user_id)
values
  ('10000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000801'),
  ('10000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000802'),
  ('10000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000803');

insert into public.posts (
  id,
  author_id,
  title,
  description,
  module,
  category,
  status,
  visibility
) values (
  '20000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000801',
  'Conteudo comunitario preservado',
  'Descricao que deve sobreviver sem identificar a conta apagada.',
  'eventos',
  'academicos',
  'published',
  'community'
);

insert into public.comments (
  id,
  post_id,
  author_id,
  author_name,
  body
) values (
  '30000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000801',
  'Erase Target',
  'Comentario que deve permanecer.'
), (
  '30000000-0000-4000-8000-000000000802',
  '20000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000802',
  'Erase Survivor',
  'Resposta que deve permanecer.'
);

update public.comments
set parent_id = '30000000-0000-4000-8000-000000000801'
where id = '30000000-0000-4000-8000-000000000802';

insert into public.comment_likes (id, comment_id, user_id)
values (
  '40000000-0000-4000-8000-000000000801',
  '30000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000802'
);

insert into public.user_ratings (
  id,
  target_user_id,
  rater_user_id,
  context_post_id,
  rating,
  comment
) values (
  '50000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000802',
  '20000000-0000-4000-8000-000000000801',
  5,
  'Avaliacao historica preservada.'
);

insert into public.user_blocks (id, blocker_id, blocked_id, reason)
values
  (
    '60000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000801',
    'safety-history'
  ),
  (
    '60000000-0000-4000-8000-000000000802',
    '00000000-0000-4000-8000-000000000803',
    '00000000-0000-4000-8000-000000000801',
    'safety-history'
  );

insert into public.reports (
  id,
  post_id,
  reporter_id,
  reason,
  details,
  status,
  entity_type
) values (
  '70000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000801',
  'privacy',
  'Registro de seguranca preservado.',
  'open',
  'post'
);

insert into public.chat_conversations (
  id,
  participant_low,
  participant_high,
  last_message_at,
  last_message_preview,
  last_message_sender,
  last_message_type
) values (
  '80000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000802',
  now(),
  'preview que sera preservado como historico compartilhado',
  '00000000-0000-4000-8000-000000000801',
  'text'
);

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content
) values
  (
    '81000000-0000-4000-8000-000000000801',
    '80000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000801',
    'text',
    'Mensagem do titular apagado.'
  ),
  (
    '81000000-0000-4000-8000-000000000802',
    '80000000-0000-4000-8000-000000000801',
    '00000000-0000-4000-8000-000000000802',
    'text',
    'Mensagem do participante remanescente.'
  );

insert into storage.buckets (id, name, public)
values ('kino-media', 'kino-media', true)
on conflict (id) do nothing;

insert into public.cadu_institutional_source_reviews (
  id,
  requested_by,
  source_id,
  source_url,
  content_url,
  content_kind,
  intent,
  idempotency_key,
  source_revision,
  registry_sha256,
  name,
  category,
  origin,
  state
) values (
  '90000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000801',
  'web.erase-target',
  'https://example.test/erase-target',
  'https://example.test/erase-target',
  'institutional_site',
  'review',
  'map-ufg-review:web.erase-target:' || repeat('a', 64),
  repeat('a', 64),
  repeat('b', 64),
  'Fonte pendente preservada',
  'institucional',
  'cadu-admin-map-ufg',
  'pending'
);

insert into public.cadu_institutional_source_reviews (
  id,
  requested_by,
  source_id,
  source_url,
  content_url,
  content_kind,
  intent,
  idempotency_key,
  source_revision,
  registry_sha256,
  name,
  category,
  origin,
  state,
  resolved_by,
  resolved_at,
  resolution_note
) values (
  '90000000-0000-4000-8000-000000000802',
  '00000000-0000-4000-8000-000000000802',
  'web.erase-resolved',
  'https://example.test/erase-resolved',
  'https://example.test/erase-resolved',
  'institutional_site',
  'review',
  'map-ufg-review:web.erase-resolved:' || repeat('c', 64),
  repeat('c', 64),
  repeat('d', 64),
  'Fonte resolvida preservada',
  'institucional',
  'cadu-admin-map-ufg',
  'approved',
  '00000000-0000-4000-8000-000000000801',
  now(),
  'Resolucao historica.'
);

insert into public.kc_unit_meta (
  unit_id,
  tier,
  note,
  updated_by,
  source,
  revision
) values (
  'erase-unit',
  2,
  'Metadado institucional preservado.',
  '00000000-0000-4000-8000-000000000801',
  'manual',
  1
);

select extensions.is(
  (
    select count(distinct blocked_subject_hash)::integer
    from public.user_blocks
    where blocked_id = '00000000-0000-4000-8000-000000000801'
  ),
  2,
  'block safety tokens are random per relationship, not globally correlatable'
);
select extensions.ok(
  not exists (
    select 1
    from public.user_blocks
    where blocked_id = '00000000-0000-4000-8000-000000000801'
      and blocked_subject_hash = encode(
        extensions.digest(
          convert_to('00000000-0000-4000-8000-000000000801', 'UTF8'),
          'sha256'
        ),
        'hex'
      )
  ),
  'known profile UUID cannot reproduce block safety tokens'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000801"}',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'kino-chat-media',
      'chat-media/80000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000801/target.pdf',
      '00000000-0000-4000-8000-000000000801'
    )$$,
  'chat participant can insert into its exact private sender folder'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'kino-chat-media',
      'chat-media/80000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000802/forged.pdf',
      '00000000-0000-4000-8000-000000000801'
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'participant cannot upload into the other sender folder'
);

select extensions.lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'kino-media',
      'chat-media/80000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000801/legacy.pdf',
      '00000000-0000-4000-8000-000000000801'
    )$$,
  'active legacy client can insert into its exact public-bucket sender folder'
);
select extensions.lives_ok(
  $$update storage.objects
    set metadata = '{"legacy_expand":true}'::jsonb
    where bucket_id = 'kino-media'
      and name = 'chat-media/80000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000801/legacy.pdf'$$,
  'active legacy client can upsert its own attachment metadata'
);
select extensions.throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'kino-media',
      'chat-media/80000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000802/legacy-forged.pdf',
      '00000000-0000-4000-8000-000000000801'
    )$$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'legacy participant cannot upload into the other sender folder'
);

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000802"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'kino-chat-media'
      and name like '%/target.pdf'
  ),
  1,
  'other conversation participant can read the private attachment'
);
select extensions.is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'kino-media'
      and name like '%/legacy.pdf'
  ),
  1,
  'other conversation participant can read legacy attachment metadata'
);
select extensions.is_empty(
  $$update storage.objects
    set metadata = '{"forged":true}'::jsonb
    where bucket_id = 'kino-media'
      and name like '%/legacy.pdf'
    returning id$$,
  'other participant cannot update the sender legacy attachment'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000803","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000803"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'kino-chat-media'
      and name like '%/target.pdf'
  ),
  0,
  'non-participant cannot read a private chat attachment'
);
select extensions.is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'kino-media'
      and name like '%/legacy.pdf'
  ),
  0,
  'non-participant cannot read legacy attachment metadata'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000801","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000801"}',
  true
);
set local role authenticated;

-- Supabase Storage sets this transaction-local guard only after it has
-- coordinated the object-store deletion. The pgTAP call still runs as the
-- authenticated subject, so the DELETE policy remains under test.
select set_config('storage.allow_delete_query', 'true', true);
select extensions.lives_ok(
  $$delete from storage.objects
    where bucket_id = 'kino-media'
      and name = 'chat-media/80000000-0000-4000-8000-000000000801/00000000-0000-4000-8000-000000000801/legacy.pdf'$$,
  'active legacy client can delete its own attachment'
);
select set_config('storage.allow_delete_query', 'false', true);

reset role;
select extensions.is(
  (
    select count(*)::integer
    from storage.objects
    where bucket_id = 'kino-media'
      and name like '%/legacy.pdf'
  ),
  0,
  'legacy sender delete removed only its exact attachment'
);
select set_config('request.jwt.claims', '{}', true);

delete from auth.users
where id = '00000000-0000-4000-8000-000000000801';

select extensions.is(
  (
    select count(*)::integer
    from public.profiles
    where id = '00000000-0000-4000-8000-000000000801'
  ),
  0,
  'target profile is deleted with the auth account'
);
select extensions.ok(
  (
    select author_id is null
    from public.posts
    where id = '20000000-0000-4000-8000-000000000801'
  ),
  'authored post survives with its author reference removed'
);
select extensions.ok(
  (
    select
      author_id is null
      and author_name = 'Conta excluida'
      and body = 'Comentario que deve permanecer.'
    from public.comments
    where id = '30000000-0000-4000-8000-000000000801'
  ),
  'authored comment survives with the canonical deleted-account label'
);
select extensions.is(
  (
    select count(*)::integer
    from public.comments
    where parent_id = '30000000-0000-4000-8000-000000000801'
  ),
  1,
  'reply relationship survives the target deletion'
);
select extensions.is(
  (
    select count(*)::integer
    from public.comment_likes
    where comment_id = '30000000-0000-4000-8000-000000000801'
  ),
  1,
  'third-party like on the preserved comment survives'
);
select extensions.ok(
  (
    select
      target_user_id is null
      and rater_user_id = '00000000-0000-4000-8000-000000000802'
      and rating = 5
    from public.user_ratings
    where id = '50000000-0000-4000-8000-000000000801'
  ),
  'received rating survives without the deleted target reference'
);
select extensions.is(
  (
    select count(*)::integer
    from public.user_blocks
    where blocked_id is null
      and blocked_subject_hash ~ '^[a-f0-9]{64}$'
  ),
  2,
  'safety blocks survive with opaque tokens and no deleted profile reference'
);
select extensions.ok(
  (
    select reporter_id is null
    from public.reports
    where id = '70000000-0000-4000-8000-000000000801'
  ),
  'safety report survives without the deleted reporter reference'
);
select extensions.ok(
  (
    select
      participant_low is null
      and participant_high = '00000000-0000-4000-8000-000000000802'
      and last_message_sender = '00000000-0000-4000-8000-000000000802'
      and last_message_preview = 'Mensagem do participante remanescente.'
    from public.chat_conversations
    where id = '80000000-0000-4000-8000-000000000801'
  ),
  'shared conversation closes while preserving the remaining participant preview'
);
select extensions.ok(
  (
    select sender_id is null
    from public.chat_messages
    where id = '81000000-0000-4000-8000-000000000801'
  ),
  'message authored by the deleted participant survives without sender UUID'
);
select extensions.is(
  (
    select count(*)::integer
    from public.cadu_institutional_source_reviews
    where requested_by is null
       or resolved_by is null
  ),
  2,
  'CADU review history survives referential nullification'
);
select extensions.ok(
  (
    select updated_by is null
    from public.kc_unit_meta
    where unit_id = 'erase-unit'
  ),
  'institutional unit metadata survives auth-user deletion'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000802","role":"authenticated","is_anonymous":false,"session_id":"10000000-0000-4000-8000-000000000802"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select count(*)::integer
    from public.chat_conversations
    where id = '80000000-0000-4000-8000-000000000801'
  ),
  1,
  'remaining participant can read the closed conversation through RLS'
);
select extensions.is(
  (
    select count(*)::integer
    from public.chat_messages
    where conversation_id = '80000000-0000-4000-8000-000000000801'
  ),
  2,
  'remaining participant can read the preserved shared message history'
);
select extensions.throws_ok(
  $$select public.kc_chat_send_message(
    '80000000-0000-4000-8000-000000000801',
    'Nova mensagem indevida',
    'text',
    null
  )$$,
  'P0001',
  'conversation_closed',
  'closed conversation rejects new messages after participant deletion'
);

reset role;

select * from extensions.finish();

rollback;
