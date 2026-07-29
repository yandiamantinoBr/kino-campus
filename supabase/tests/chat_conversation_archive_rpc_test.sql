begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(29);

select extensions.ok(
  to_regprocedure(
    'public.kc_chat_set_conversation_archived(uuid,boolean)'
  ) is not null,
  'public archive RPC exists'
);

select extensions.ok(
  to_regprocedure(
    'kc_private.kc_chat_set_conversation_archived(uuid,boolean)'
  ) is not null,
  'private archive worker exists'
);

select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.kc_chat_set_conversation_archived(uuid,boolean)',
    'execute'
  ),
  'anon cannot execute the public archive RPC'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.kc_chat_set_conversation_archived(uuid,boolean)',
    'execute'
  ),
  'authenticated can execute the public archive RPC'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'public.kc_chat_set_conversation_archived(uuid,boolean)',
    'execute'
  ),
  'service_role is not exposed to the user archive RPC'
);

select extensions.ok(
  not has_function_privilege(
    'anon',
    'kc_private.kc_chat_set_conversation_archived(uuid,boolean)',
    'execute'
  ),
  'anon cannot execute the private archive worker'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'kc_private.kc_chat_set_conversation_archived(uuid,boolean)',
    'execute'
  ),
  'authenticated can delegate through the invoker wrapper'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'kc_private.kc_chat_set_conversation_archived(uuid,boolean)',
    'execute'
  ),
  'service_role is not exposed to the private user worker'
);

select extensions.ok(
  not has_table_privilege(
    'anon',
    'public.chat_conversations',
    'update'
  ),
  'anon has no direct conversation UPDATE'
);

select extensions.ok(
  has_table_privilege(
    'authenticated',
    'public.chat_conversations',
    'update'
  ),
  'authenticated temporarily retains direct conversation UPDATE during expand'
);

select extensions.ok(
  has_table_privilege(
    'service_role',
    'public.chat_conversations',
    'update'
  ),
  'service_role retains internal conversation UPDATE'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_policies as policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'chat_conversations'
      and policy_row.policyname = 'chat_conv_update_own'
      and policy_row.cmd = 'UPDATE'
      and policy_row.roles = array['authenticated'::name]
      and policy_row.qual like '%kc_is_current_session_active%'
      and policy_row.qual like '%participant_low%'
      and policy_row.qual like '%participant_high%'
      and policy_row.with_check like '%kc_is_current_session_active%'
      and policy_row.with_check like '%participant_low%'
      and policy_row.with_check like '%participant_high%'
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgrelid = 'public.chat_conversations'::regclass
      and trigger_row.tgname = 'kc_chat_legacy_archive_update_guard'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgfoid = to_regprocedure(
        'kc_private.kc_guard_legacy_chat_archive_update()'
      )
  ),
  'legacy UPDATE remains session/participant bound and guarded to own archive side'
);

insert into auth.users (id, email)
values
  (
    '00000000-0000-4000-8000-000000000701',
    'archive-low@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    'archive-high@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000703',
    'archive-third@example.test'
  );

insert into auth.sessions (id, user_id)
values
  (
    '10000000-0000-4000-8000-000000000701',
    '00000000-0000-4000-8000-000000000701'
  ),
  (
    '10000000-0000-4000-8000-000000000702',
    '00000000-0000-4000-8000-000000000702'
  ),
  (
    '10000000-0000-4000-8000-000000000703',
    '00000000-0000-4000-8000-000000000703'
  );

insert into public.profiles (
  id,
  full_name,
  display_name,
  email,
  profile_public
)
values
  (
    '00000000-0000-4000-8000-000000000701',
    'Archive Low',
    'Low',
    'archive-low@example.test',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000702',
    'Archive High',
    'High',
    'archive-high@example.test',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000703',
    'Archive Third',
    'Third',
    'archive-third@example.test',
    true
  )
on conflict (id)
do update set
  full_name = excluded.full_name,
  display_name = excluded.display_name,
  email = excluded.email,
  profile_public = excluded.profile_public;

insert into public.chat_conversations (
  id,
  participant_low,
  participant_high,
  last_message_preview
)
values (
  '30000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000702',
  'Server-owned preview'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000701"}',
  true
);
set local role authenticated;

select extensions.lives_ok(
  $$update public.chat_conversations
    set archived_by_low = true
    where id = '30000000-0000-4000-8000-000000000701'$$,
  'an active low participant can use the legacy own-side archive update'
);

select extensions.throws_ok(
  $$update public.chat_conversations
    set archived_by_high = true
    where id = '30000000-0000-4000-8000-000000000701'$$,
  '42501',
  'CHAT_LEGACY_UPDATE_RESTRICTED',
  'the legacy update cannot mutate the other participant archive flag'
);

select extensions.is(
  (
    public.kc_chat_set_conversation_archived(
      '30000000-0000-4000-8000-000000000701',
      true
    ) ->> 'archived'
  )::boolean,
  true,
  'low participant can archive its own side'
);

select extensions.throws_ok(
  $$update public.chat_conversations
    set last_message_preview = 'client tamper'
    where id = '30000000-0000-4000-8000-000000000701'$$,
  '42501',
  'CHAT_LEGACY_UPDATE_RESTRICTED',
  'legacy compatibility cannot mutate server-owned conversation fields'
);

reset role;

select extensions.is(
  (
    select conversation_row.archived_by_low
    from public.chat_conversations as conversation_row
    where conversation_row.id =
      '30000000-0000-4000-8000-000000000701'
  ),
  true,
  'low archive flag changed'
);

select extensions.is(
  (
    select conversation_row.archived_by_high
    from public.chat_conversations as conversation_row
    where conversation_row.id =
      '30000000-0000-4000-8000-000000000701'
  ),
  false,
  'low participant cannot change the high archive flag'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000702"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    public.kc_chat_set_conversation_archived(
      '30000000-0000-4000-8000-000000000701',
      true
    ) ->> 'archived'
  )::boolean,
  true,
  'high participant can archive its own side'
);

reset role;

select extensions.is(
  (
    select conversation_row.archived_by_high
    from public.chat_conversations as conversation_row
    where conversation_row.id =
      '30000000-0000-4000-8000-000000000701'
  ),
  true,
  'high archive flag changed'
);

select extensions.is(
  (
    select conversation_row.archived_by_low
    from public.chat_conversations as conversation_row
    where conversation_row.id =
      '30000000-0000-4000-8000-000000000701'
  ),
  true,
  'high participant cannot change the low archive flag'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000702","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000702"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    public.kc_chat_set_conversation_archived(
      '30000000-0000-4000-8000-000000000701',
      false
    ) ->> 'archived'
  )::boolean,
  false,
  'high participant can unarchive its own side'
);

reset role;

select extensions.is(
  (
    select conversation_row.archived_by_high
    from public.chat_conversations as conversation_row
    where conversation_row.id =
      '30000000-0000-4000-8000-000000000701'
  ),
  false,
  'high unarchive flag changed'
);

select extensions.is(
  (
    select conversation_row.last_message_preview
    from public.chat_conversations as conversation_row
    where conversation_row.id =
      '30000000-0000-4000-8000-000000000701'
  ),
  'Server-owned preview',
  'archive transitions do not alter the server-owned preview'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated","session_id":"10000000-0000-4000-8000-000000009999"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$update public.chat_conversations
    set archived_by_low = false
    where id = '30000000-0000-4000-8000-000000000701'
    returning id$$,
  '42501',
  'AUTH_SESSION_NOT_ACTIVE',
  'an inactive session cannot use the legacy direct archive update'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000703","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000703"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_chat_set_conversation_archived(
    '30000000-0000-4000-8000-000000000701',
    true
  )$$,
  'P0001',
  'conversation_not_found',
  'a nonparticipant cannot archive or confirm the conversation'
);

select extensions.throws_ok(
  $$select public.kc_chat_set_conversation_archived(
    '30000000-0000-4000-8000-000000009999',
    true
  )$$,
  'P0001',
  'conversation_not_found',
  'a missing conversation is indistinguishable from another user chat'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000701"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_chat_set_conversation_archived(
    '30000000-0000-4000-8000-000000000701',
    null
  )$$,
  'P0001',
  'invalid_archived',
  'archive state must be a boolean'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000701","role":"authenticated","session_id":"10000000-0000-4000-8000-000000009999"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_chat_set_conversation_archived(
    '30000000-0000-4000-8000-000000000701',
    true
  )$$,
  'P0001',
  'session_inactive',
  'an inactive session cannot change archive state'
);

reset role;

select * from extensions.finish();

rollback;
