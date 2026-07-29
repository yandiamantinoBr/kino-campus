begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(122);

-- The consolidated baseline kept these public wrappers but lost their private
-- workers. Every signature must now resolve after a clean db reset.
select extensions.ok(
  to_regprocedure(signature) is not null,
  signature || ' exists'
)
from unnest(array[
  'kc_private.kc_get_feed_ad_config(text,text,text)',
  'kc_private.kc_get_personalized_tabs(text,integer)',
  'kc_private.kc_chat_refresh_conversation_preview(uuid,boolean)',
  'kc_private.kc_chat_after_message_insert()',
  'kc_private.kc_chat_after_message_update()',
  'kc_private.kc_chat_block_user(uuid,text)',
  'kc_private.kc_chat_delete_message(uuid)',
  'kc_private.kc_chat_edit_message(uuid,text)',
  'kc_private.kc_chat_is_blocked(uuid)',
  'kc_private.kc_chat_list_conversations(integer,timestamptz)',
  'kc_private.kc_chat_mark_read(uuid,uuid)',
  'kc_private.kc_chat_report_message(uuid,text,text)',
  'kc_private.kc_chat_start_conversation(uuid)',
  'kc_private.kc_chat_unblock_user(uuid)',
  'kc_private.kc_chat_unread_total()',
  'kc_private.kc_reactivate_post(uuid)'
]::text[]) as missing_worker(signature);

select extensions.ok(
  not has_function_privilege('anon', signature, 'execute'),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.kc_chat_block_user(uuid,text)',
  'public.kc_chat_delete_message(uuid)',
  'public.kc_chat_edit_message(uuid,text)',
  'public.kc_chat_is_blocked(uuid)',
  'public.kc_chat_list_conversations(integer,timestamptz)',
  'public.kc_chat_list_messages(uuid,integer,timestamptz)',
  'public.kc_chat_mark_read(uuid,uuid)',
  'public.kc_chat_report_message(uuid,text,text)',
  'public.kc_chat_send_message(uuid,text,text,text)',
  'public.kc_chat_set_message_reply(uuid,uuid)',
  'public.kc_chat_start_conversation(uuid)',
  'public.kc_chat_toggle_reaction(uuid,text)',
  'public.kc_chat_unblock_user(uuid)',
  'public.kc_chat_unread_total()',
  'public.kc_bump_post(uuid)',
  'public.kc_check_post_flood_limit(uuid,text)',
  'public.kc_close_post(uuid,text)',
  'public.kc_get_post_flood_limit(uuid,text)',
  'public.kc_reactivate_post(uuid)',
  'public.kc_record_post_audit_event(uuid,text,jsonb)',
  'public.kc_renew_post(uuid)',
  'public.kc_toggle_post_status(uuid)'
]::text[]) as authenticated_wrapper(signature);

select extensions.ok(
  has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains executable by authenticated'
)
from unnest(array[
  'public.kc_chat_block_user(uuid,text)',
  'public.kc_chat_delete_message(uuid)',
  'public.kc_chat_edit_message(uuid,text)',
  'public.kc_chat_is_blocked(uuid)',
  'public.kc_chat_list_conversations(integer,timestamptz)',
  'public.kc_chat_list_messages(uuid,integer,timestamptz)',
  'public.kc_chat_mark_read(uuid,uuid)',
  'public.kc_chat_report_message(uuid,text,text)',
  'public.kc_chat_send_message(uuid,text,text,text)',
  'public.kc_chat_set_message_reply(uuid,uuid)',
  'public.kc_chat_start_conversation(uuid)',
  'public.kc_chat_toggle_reaction(uuid,text)',
  'public.kc_chat_unblock_user(uuid)',
  'public.kc_chat_unread_total()',
  'public.kc_bump_post(uuid)',
  'public.kc_check_post_flood_limit(uuid,text)',
  'public.kc_close_post(uuid,text)',
  'public.kc_get_post_flood_limit(uuid,text)',
  'public.kc_reactivate_post(uuid)',
  'public.kc_record_post_audit_event(uuid,text,jsonb)',
  'public.kc_renew_post(uuid)',
  'public.kc_toggle_post_status(uuid)'
]::text[]) as authenticated_wrapper(signature);

select extensions.ok(
  not has_function_privilege('anon', signature, 'execute'),
  signature || ' private worker is not executable by anon'
)
from unnest(array[
  'kc_private.kc_chat_block_user(uuid,text)',
  'kc_private.kc_chat_delete_message(uuid)',
  'kc_private.kc_chat_edit_message(uuid,text)',
  'kc_private.kc_chat_is_blocked(uuid)',
  'kc_private.kc_chat_list_conversations(integer,timestamptz)',
  'kc_private.kc_chat_mark_read(uuid,uuid)',
  'kc_private.kc_chat_report_message(uuid,text,text)',
  'kc_private.kc_chat_start_conversation(uuid)',
  'kc_private.kc_chat_unblock_user(uuid)',
  'kc_private.kc_chat_unread_total()',
  'kc_private.kc_reactivate_post(uuid)'
]::text[]) as authenticated_worker(signature);

select extensions.ok(
  has_function_privilege('authenticated', signature, 'execute'),
  signature || ' private worker is executable by authenticated'
)
from unnest(array[
  'kc_private.kc_chat_block_user(uuid,text)',
  'kc_private.kc_chat_delete_message(uuid)',
  'kc_private.kc_chat_edit_message(uuid,text)',
  'kc_private.kc_chat_is_blocked(uuid)',
  'kc_private.kc_chat_list_conversations(integer,timestamptz)',
  'kc_private.kc_chat_mark_read(uuid,uuid)',
  'kc_private.kc_chat_report_message(uuid,text,text)',
  'kc_private.kc_chat_start_conversation(uuid)',
  'kc_private.kc_chat_unblock_user(uuid)',
  'kc_private.kc_chat_unread_total()',
  'kc_private.kc_reactivate_post(uuid)'
]::text[]) as authenticated_worker(signature);

select extensions.ok(
  has_function_privilege('anon', signature, 'execute'),
  signature || ' remains publicly executable'
)
from unnest(array[
  'public.kc_get_feed_ad_config(text,text,text)',
  'public.kc_get_personalized_tabs(text,integer)',
  'kc_private.kc_get_feed_ad_config(text,text,text)',
  'kc_private.kc_get_personalized_tabs(text,integer)'
]::text[]) as public_worker(signature);

select extensions.ok(
  has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains executable by authenticated'
)
from unnest(array[
  'public.kc_get_feed_ad_config(text,text,text)',
  'public.kc_get_personalized_tabs(text,integer)',
  'kc_private.kc_get_feed_ad_config(text,text,text)',
  'kc_private.kc_get_personalized_tabs(text,integer)'
]::text[]) as public_worker(signature);

insert into auth.users (id, email)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'worker-owner@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'worker-peer@example.test'
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    'worker-third@example.test'
  );

insert into auth.sessions (id, user_id)
values
  (
    '10000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000601'
  ),
  (
    '10000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000602'
  ),
  (
    '10000000-0000-4000-8000-000000000603',
    '00000000-0000-4000-8000-000000000603'
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
    '00000000-0000-4000-8000-000000000601',
    'Worker Owner',
    'Owner',
    'worker-owner@example.test',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'Worker Peer',
    'Peer',
    'worker-peer@example.test',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    'Worker Third',
    'Third',
    'worker-third@example.test',
    true
  )
on conflict (id)
do update set
  full_name = excluded.full_name,
  display_name = excluded.display_name,
  email = excluded.email,
  profile_public = excluded.profile_public;

insert into public.ad_network_settings (
  id,
  status,
  provider,
  adsense_slots
)
values (
  'default',
  'active',
  'adsense',
  '{"feed_inline":"slot-public"}'::jsonb
)
on conflict (id)
do update set
  status = excluded.status,
  provider = excluded.provider,
  adsense_slots = excluded.adsense_slots;

insert into public.posts (
  id,
  author_id,
  title,
  module,
  category,
  status,
  visibility,
  highlight_score,
  created_at
)
values
  (
    '20000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000601',
    'Global public tab',
    'eventos',
    'global',
    'published',
    'public',
    100,
    now() - interval '1 hour'
  ),
  (
    '20000000-0000-4000-8000-000000000602',
    '00000000-0000-4000-8000-000000000601',
    'Preferred public tab',
    'eventos',
    'preferred',
    'published',
    'public',
    1,
    now() - interval '1 hour'
  ),
  (
    '20000000-0000-4000-8000-000000000603',
    '00000000-0000-4000-8000-000000000602',
    'Community-only tab',
    'eventos',
    'community-secret',
    'published',
    'community',
    0.5,
    now() - interval '1 hour'
  ),
  (
    '20000000-0000-4000-8000-000000000604',
    '00000000-0000-4000-8000-000000000601',
    'Closed owner post',
    'eventos',
    'global',
    'closed',
    'community',
    0,
    now() - interval '2 days'
  ),
  (
    '20000000-0000-4000-8000-000000000605',
    '00000000-0000-4000-8000-000000000603',
    'Closed erased-owner post',
    'eventos',
    'global',
    'closed',
    'public',
    0,
    now() - interval '2 days'
  );

update public.posts as post_row
set author_id = null
where post_row.id = '20000000-0000-4000-8000-000000000605';

-- Moderation triggers intentionally route fixture inserts through `pending`.
-- Set the states needed by this worker-level test as the transaction owner.
update public.posts as post_row
set status = case
  when post_row.id in (
    '20000000-0000-4000-8000-000000000604',
    '20000000-0000-4000-8000-000000000605'
  ) then 'closed'
  else 'published'
end
where post_row.id in (
  '20000000-0000-4000-8000-000000000601',
  '20000000-0000-4000-8000-000000000602',
  '20000000-0000-4000-8000-000000000603',
  '20000000-0000-4000-8000-000000000604',
  '20000000-0000-4000-8000-000000000605'
);

insert into public.home_category_affinity (
  owner_kind,
  owner_key,
  user_id,
  session_id,
  module_key,
  category_key,
  score,
  interactions_count
)
values (
  'user',
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000601',
  null,
  'eventos',
  'preferred',
  1000,
  20
);

insert into public.privacy_consent_events (
  session_hash,
  user_id,
  consent_version,
  preferences_enabled,
  analytics_enabled,
  source
)
values (
  encode(
    extensions.digest('worker-owner-browser-session', 'sha256'),
    'hex'
  ),
  '00000000-0000-4000-8000-000000000601',
  '2026-07-28',
  true,
  true,
  'custom'
);

set local role anon;

select extensions.is(
  public.kc_get_feed_ad_config(
    '/settings.html',
    '',
    'feed_inline'
  ) ->> 'reason',
  'blocked_page',
  'ad configuration remains disabled on a sensitive page'
);

select extensions.is(
  (
    public.kc_get_feed_ad_config(
      '/index.html',
      '',
      'feed_inline'
    ) ->> 'enabled'
  )::boolean,
  true,
  'anon can load the safe public advertisement configuration'
);

select extensions.is(
  (
    select count(*)::integer
    from public.kc_get_personalized_tabs(
      'attacker-controlled-session',
      10
    ) as tab_row
    where tab_row.out_category_key = 'community-secret'
  ),
  0,
  'anon fallback excludes community-only posts'
);

select extensions.is(
  (
    select tab_row.out_category_key
    from public.kc_get_personalized_tabs(
      'worker-owner-browser-session',
      10
    ) as tab_row
    limit 1
  ),
  'global',
  'anon cannot activate stored affinity by presenting a session id'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000601"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select tab_row.out_category_key
    from public.kc_get_personalized_tabs(
      'worker-owner-browser-session',
      10
    ) as tab_row
    limit 1
  ),
  'preferred',
  'a consented owner receives owner affinity'
);

select extensions.is(
  (
    select count(*)::integer
    from public.kc_get_personalized_tabs(
      'worker-owner-browser-session',
      10
    ) as tab_row
    where tab_row.out_category_key = 'community-secret'
  ),
  1,
  'an authenticated caller can receive community-visible fallback signals'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000602"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select tab_row.out_category_key
    from public.kc_get_personalized_tabs(
      'worker-peer-session-without-consent',
      10
    ) as tab_row
    limit 1
  ),
  'global',
  'an authenticated caller without consent receives aggregate fallback only'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000601"}',
  true
);
set local role authenticated;

select extensions.ok(
  (
    select conversation_row.out_is_new
    from public.kc_chat_start_conversation(
      '00000000-0000-4000-8000-000000000602'
    ) as conversation_row
  ),
  'starting a conversation creates the pair once'
);

select extensions.lives_ok(
  $$select public.kc_chat_block_user(
    '00000000-0000-4000-8000-000000000602',
    'safety test'
  )$$,
  'a user can block another existing profile'
);

select extensions.throws_ok(
  $$select * from public.kc_chat_start_conversation(
    '00000000-0000-4000-8000-000000000602'
  )$$,
  'P0001',
  'blocked',
  'a block prevents reopening even an existing conversation'
);

select extensions.lives_ok(
  $$select public.kc_chat_unblock_user(
    '00000000-0000-4000-8000-000000000602'
  )$$,
  'the blocker can remove their own block'
);

select extensions.is(
  (
    select conversation_row.out_is_new
    from public.kc_chat_start_conversation(
      '00000000-0000-4000-8000-000000000602'
    ) as conversation_row
  ),
  false,
  'starting an existing unblocked pair is idempotent'
);

reset role;

insert into public.chat_conversations (
  id,
  participant_low,
  participant_high
)
values (
  '30000000-0000-4000-8000-000000000603',
  '00000000-0000-4000-8000-000000000602',
  '00000000-0000-4000-8000-000000000603'
);

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content,
  media_path,
  created_at
)
select
  '31000000-0000-4000-8000-000000000601',
  conversation_row.id,
  '00000000-0000-4000-8000-000000000602',
  'text',
  'Peer message already rendered',
  null,
  now() - interval '2 minutes'
from public.chat_conversations as conversation_row
where conversation_row.participant_low =
    '00000000-0000-4000-8000-000000000601'
  and conversation_row.participant_high =
    '00000000-0000-4000-8000-000000000602';

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content,
  media_path,
  created_at
)
values (
  '31000000-0000-4000-8000-000000000603',
  '30000000-0000-4000-8000-000000000603',
  '00000000-0000-4000-8000-000000000603',
  'text',
  'Marker from a different conversation',
  null,
  now() - interval '1 minute'
);

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content,
  media_path,
  created_at
)
select
  '31000000-0000-4000-8000-000000000604',
  conversation_row.id,
  '00000000-0000-4000-8000-000000000601',
  'text',
  'Owner editable message',
  null,
  now() - interval '1 minute'
from public.chat_conversations as conversation_row
where conversation_row.participant_low =
    '00000000-0000-4000-8000-000000000601'
  and conversation_row.participant_high =
    '00000000-0000-4000-8000-000000000602';

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content,
  media_path,
  created_at
)
select
  '31000000-0000-4000-8000-000000000605',
  conversation_row.id,
  '00000000-0000-4000-8000-000000000601',
  'image',
  'Owner media',
  'chat-media/' || conversation_row.id::text
    || '/00000000-0000-4000-8000-000000000601/file.jpg',
  now() - interval '1 minute'
from public.chat_conversations as conversation_row
where conversation_row.participant_low =
    '00000000-0000-4000-8000-000000000601'
  and conversation_row.participant_high =
    '00000000-0000-4000-8000-000000000602';

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content,
  created_at
)
select
  '31000000-0000-4000-8000-000000000607',
  conversation_row.id,
  '00000000-0000-4000-8000-000000000601',
  'text',
  'Sensitive preview must disappear',
  now() + interval '1 second'
from public.chat_conversations as conversation_row
where conversation_row.participant_low =
    '00000000-0000-4000-8000-000000000601'
  and conversation_row.participant_high =
    '00000000-0000-4000-8000-000000000602';

select extensions.is(
  (
    select conversation_row.last_message_preview
    from public.chat_conversations as conversation_row
    where conversation_row.participant_low =
        '00000000-0000-4000-8000-000000000601'
      and conversation_row.participant_high =
        '00000000-0000-4000-8000-000000000602'
  ),
  'Sensitive preview must disappear',
  'message insertion denormalizes the inbox preview'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000601"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_chat_mark_read(
    (
      select conversation_row.id
      from public.chat_conversations as conversation_row
      where conversation_row.participant_low =
          '00000000-0000-4000-8000-000000000601'
        and conversation_row.participant_high =
          '00000000-0000-4000-8000-000000000602'
    ),
    '31000000-0000-4000-8000-000000000603'
  )$$,
  'P0001',
  'read_marker_wrong_conversation',
  'read marker must belong to the selected conversation'
);

select extensions.lives_ok(
  $$select public.kc_chat_mark_read(
    (
      select conversation_row.id
      from public.chat_conversations as conversation_row
      where conversation_row.participant_low =
          '00000000-0000-4000-8000-000000000601'
        and conversation_row.participant_high =
          '00000000-0000-4000-8000-000000000602'
    ),
    '31000000-0000-4000-8000-000000000601'
  )$$,
  'a valid marker updates read state'
);

select extensions.is(
  (
    select read_row.last_read_msg_id
    from public.chat_read_state as read_row
    where read_row.user_id =
      '00000000-0000-4000-8000-000000000601'
  ),
  '31000000-0000-4000-8000-000000000601'::uuid,
  'read state stores the validated message marker'
);

select extensions.ok(
  (
    select message_row.read_at is not null
    from public.chat_messages as message_row
    where message_row.id =
      '31000000-0000-4000-8000-000000000601'
  ),
  'the validated marker updates rendered message checkmarks'
);

reset role;

insert into public.chat_messages (
  id,
  conversation_id,
  sender_id,
  message_type,
  content,
  created_at
)
select
  '31000000-0000-4000-8000-000000000606',
  conversation_row.id,
  '00000000-0000-4000-8000-000000000602',
  'text',
  'Peer message after the marker',
  now()
from public.chat_conversations as conversation_row
where conversation_row.participant_low =
    '00000000-0000-4000-8000-000000000601'
  and conversation_row.participant_high =
    '00000000-0000-4000-8000-000000000602';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000601"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select unread_row.out_total
    from public.kc_chat_unread_total() as unread_row
  ),
  1::bigint,
  'messages newer than the validated marker remain unread'
);

select extensions.is(
  (
    select conversation_row.out_other_user_id
    from public.kc_chat_list_conversations(10, null)
      as conversation_row
    limit 1
  ),
  '00000000-0000-4000-8000-000000000602'::uuid,
  'conversation listing is scoped to the authenticated participant'
);

select extensions.is(
  (
    select delete_row.out_media_path
    from public.kc_chat_delete_message(
      '31000000-0000-4000-8000-000000000607'
    ) as delete_row
  ),
  null::text,
  'a sender can soft-delete the latest text message'
);

select extensions.is(
  (
    select conversation_row.out_last_message_preview
    from public.kc_chat_list_conversations(10, null)
      as conversation_row
    where conversation_row.out_conversation_id = (
      select stored_conversation.id
      from public.chat_conversations as stored_conversation
      where stored_conversation.participant_low =
          '00000000-0000-4000-8000-000000000601'
        and stored_conversation.participant_high =
          '00000000-0000-4000-8000-000000000602'
    )
  ),
  'Peer message after the marker',
  'deleting the latest message removes residual plaintext from the inbox'
);

select extensions.lives_ok(
  $$select public.kc_chat_edit_message(
    '31000000-0000-4000-8000-000000000604',
    'Owner edited message'
  )$$,
  'a sender can edit their own recent text message'
);

select extensions.is(
  (
    select message_row.content
    from public.chat_messages as message_row
    where message_row.id =
      '31000000-0000-4000-8000-000000000604'
  ),
  'Owner edited message',
  'message edit persists the validated content'
);

select extensions.lives_ok(
  $$select public.kc_chat_report_message(
    '31000000-0000-4000-8000-000000000606',
    'privacy',
    'privacy report'
  )$$,
  'a participant can report the other participant message'
);

reset role;

select extensions.ok(
  exists (
    select 1
    from public.reports as report_row
    where report_row.entity_type = 'chat_message'
      and report_row.entity_id =
        '31000000-0000-4000-8000-000000000606'
      and report_row.reporter_id =
        '00000000-0000-4000-8000-000000000601'
  ),
  'chat report is stored with the authenticated reporter'
);

set local role authenticated;

select extensions.is(
  (
    select delete_row.out_media_path
    from public.kc_chat_delete_message(
      '31000000-0000-4000-8000-000000000605'
    ) as delete_row
  ),
  (
    select 'chat-media/' || conversation_row.id::text
      || '/00000000-0000-4000-8000-000000000601/file.jpg'
    from public.chat_conversations as conversation_row
    where conversation_row.participant_low =
        '00000000-0000-4000-8000-000000000601'
      and conversation_row.participant_high =
        '00000000-0000-4000-8000-000000000602'
  ),
  'message deletion returns only the sender-owned media path'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000602","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000602"}',
  true
);
set local role authenticated;

select extensions.throws_ok(
  $$select public.kc_chat_edit_message(
    '31000000-0000-4000-8000-000000000604',
    'Peer cannot edit'
  )$$,
  'P0001',
  'not_sender',
  'a participant cannot edit the other sender message'
);

select extensions.is(
  public.kc_reactivate_post(
    '20000000-0000-4000-8000-000000000604'
  ) ->> 'code',
  'FORBIDDEN',
  'a non-owner cannot reactivate a closed post'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000601"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    public.kc_reactivate_post(
      '20000000-0000-4000-8000-000000000604'
    ) ->> 'ok'
  )::boolean,
  true,
  'the owner can reactivate their closed post'
);

select extensions.is(
  (
    select post_row.status
    from public.posts as post_row
    where post_row.id =
      '20000000-0000-4000-8000-000000000604'
  ),
  'published',
  'post reactivation preserves the public wrapper contract'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  public.kc_reactivate_post(
    '20000000-0000-4000-8000-000000000605'
  ) ->> 'code',
  'AUTHOR_DELETED',
  'an erased-owner post cannot be reactivated by privileged automation'
);

reset role;
update public.chat_conversations as conversation_row
set participant_high = null
where conversation_row.participant_low =
    '00000000-0000-4000-8000-000000000601'
  and conversation_row.participant_high =
    '00000000-0000-4000-8000-000000000602';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000601","role":"authenticated","session_id":"10000000-0000-4000-8000-000000000601"}',
  true
);
set local role authenticated;

select extensions.is(
  (
    select conversation_row.out_other_display_name
    from public.kc_chat_list_conversations(10, null)
      as conversation_row
    limit 1
  ),
  'Conta excluida',
  'the remaining participant can list a preserved closed conversation'
);

reset role;

select * from extensions.finish();

rollback;
