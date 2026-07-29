-- Remove inherited PUBLIC/anon access from notification worker primitives.
-- These routines expose destinations, payloads or mutation capabilities and
-- must only be callable by the service worker (or by their owner from triggers).

begin;

do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
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
  ]
  loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Required notification worker function is missing: %',
        v_signature;
    end if;

    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated',
      v_function
    );
    execute pg_catalog.format(
      'grant execute on function %s to service_role',
      v_function
    );
  end loop;
end;
$$;

-- Owner-facing notification RPCs remain available only to a live authenticated
-- session (the global PostgREST pre-request barrier and each function's
-- auth.uid()-scoped implementation provide the ownership checks).
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.kc_get_notifications(integer,integer)',
    'public.kc_mark_all_notifications_read()',
    'public.kc_mark_notifications_read(uuid[])',
    'public.kc_unread_notification_count()'
  ]
  loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Required owner notification function is missing: %',
        v_signature;
    end if;

    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated',
      v_function
    );
    execute pg_catalog.format(
      'grant execute on function %s to authenticated, service_role',
      v_function
    );
  end loop;
end;
$$;

-- This immutable helper is needed by authenticated inserts that rely on the
-- notification_preferences column default, but it has no anonymous use case.
revoke all on function public.kc_default_notification_preferences()
  from public, anon, authenticated;
grant execute on function public.kc_default_notification_preferences()
  to authenticated, service_role;

comment on function public.kc_resolve_notification_delivery_destination(uuid, text) is
  'Internal service-only resolver. Returns private delivery destinations and must never be exposed to anon/authenticated RPC callers.';
comment on function public.kc_claim_notification_delivery_batch(text, integer, text) is
  'Internal service-only atomic outbox claim. Returned rows contain private destinations and provider payloads.';
comment on function public.kc_record_notification_delivery_attempt(
  uuid,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  timestamp with time zone
) is
  'Internal service-only outbox completion primitive.';

notify pgrst, 'reload schema';

commit;
