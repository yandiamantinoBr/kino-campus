begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    signature,
    'execute'
  ),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.kc_build_notification_delivery_payload(text,text,text,jsonb,uuid)',
  'public.kc_claim_notification_delivery_batch(text,integer,text)',
  'public.kc_count_recent_notification_deliveries(uuid,text,timestamp with time zone)',
  'public.kc_emit_notification_event(uuid,text,text,text,jsonb)',
  'public.kc_enqueue_notification_delivery(uuid,text,text,text,text,jsonb,uuid)',
  'public.kc_notification_channel_enabled(uuid,text,text)',
  'public.kc_prune_old_notifications()',
  'public.kc_record_notification_delivery_attempt(uuid,text,text,text,jsonb,text,text,timestamp with time zone)',
  'public.kc_resolve_notification_delivery_destination(uuid,text)',
  'public.kc_touch_notification_channel_target_consent()',
  'public.kc_trigger_notification_dispatch(text,integer,boolean,text)'
]::text[]) as worker(signature);

select ok(
  not pg_catalog.has_function_privilege(
    'authenticated',
    signature,
    'execute'
  ),
  signature || ' is not executable directly by authenticated'
)
from unnest(array[
  'public.kc_build_notification_delivery_payload(text,text,text,jsonb,uuid)',
  'public.kc_claim_notification_delivery_batch(text,integer,text)',
  'public.kc_count_recent_notification_deliveries(uuid,text,timestamp with time zone)',
  'public.kc_emit_notification_event(uuid,text,text,text,jsonb)',
  'public.kc_enqueue_notification_delivery(uuid,text,text,text,text,jsonb,uuid)',
  'public.kc_notification_channel_enabled(uuid,text,text)',
  'public.kc_prune_old_notifications()',
  'public.kc_record_notification_delivery_attempt(uuid,text,text,text,jsonb,text,text,timestamp with time zone)',
  'public.kc_resolve_notification_delivery_destination(uuid,text)',
  'public.kc_touch_notification_channel_target_consent()',
  'public.kc_trigger_notification_dispatch(text,integer,boolean,text)'
]::text[]) as worker(signature);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    signature,
    'execute'
  ),
  signature || ' remains executable by service_role'
)
from unnest(array[
  'public.kc_build_notification_delivery_payload(text,text,text,jsonb,uuid)',
  'public.kc_claim_notification_delivery_batch(text,integer,text)',
  'public.kc_count_recent_notification_deliveries(uuid,text,timestamp with time zone)',
  'public.kc_emit_notification_event(uuid,text,text,text,jsonb)',
  'public.kc_enqueue_notification_delivery(uuid,text,text,text,text,jsonb,uuid)',
  'public.kc_notification_channel_enabled(uuid,text,text)',
  'public.kc_prune_old_notifications()',
  'public.kc_record_notification_delivery_attempt(uuid,text,text,text,jsonb,text,text,timestamp with time zone)',
  'public.kc_resolve_notification_delivery_destination(uuid,text)',
  'public.kc_touch_notification_channel_target_consent()',
  'public.kc_trigger_notification_dispatch(text,integer,boolean,text)'
]::text[]) as worker(signature);

select ok(
  not pg_catalog.has_function_privilege('anon', signature, 'execute'),
  signature || ' is not executable by anon'
)
from unnest(array[
  'public.kc_get_notifications(integer,integer)',
  'public.kc_mark_all_notifications_read()',
  'public.kc_mark_notifications_read(uuid[])',
  'public.kc_unread_notification_count()'
]::text[]) as owner_rpc(signature);

select ok(
  pg_catalog.has_function_privilege('authenticated', signature, 'execute'),
  signature || ' remains executable by authenticated'
)
from unnest(array[
  'public.kc_get_notifications(integer,integer)',
  'public.kc_mark_all_notifications_read()',
  'public.kc_mark_notifications_read(uuid[])',
  'public.kc_unread_notification_count()'
]::text[]) as owner_rpc(signature);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.kc_default_notification_preferences()',
    'execute'
  ),
  'notification preference defaults are not exposed to anon'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.kc_default_notification_preferences()',
    'execute'
  ),
  'notification preference defaults remain available to authenticated'
);

select ok(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.kc_default_notification_preferences()',
    'execute'
  ),
  'notification preference defaults remain available to service_role'
);

select * from finish();

rollback;
