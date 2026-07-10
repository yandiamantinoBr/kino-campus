-- Keep the asynchronous dispatcher observable without exposing its privileged trigger.

create or replace function public.kc_trigger_notification_dispatch(
  p_channel text default null,
  p_limit integer default null,
  p_dry_run boolean default false,
  p_source text default 'pg_cron'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime_url text;
  v_runtime_secret text;
  v_runtime_limit integer;
  v_function_url text := nullif(current_setting('app.settings.kc_notification_dispatch_function_url', true), '');
  v_dispatch_secret text := nullif(current_setting('app.settings.kc_notification_dispatch_secret', true), '');
  v_setting_limit_raw text := nullif(current_setting('app.settings.kc_notification_dispatch_batch_limit', true), '');
  v_setting_limit integer := 25;
  v_limit integer := 25;
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_source text := coalesce(nullif(trim(coalesce(p_source, '')), ''), 'pg_cron');
  v_body jsonb;
  v_request_id bigint;
begin
  select
    nullif(trim(coalesce(r.function_url, '')), ''),
    nullif(trim(coalesce(r.dispatch_secret, '')), ''),
    r.batch_limit
    into v_runtime_url, v_runtime_secret, v_runtime_limit
  from public.notification_dispatch_runtime as r
  where r.slot = 'primary';

  v_function_url := coalesce(v_runtime_url, v_function_url);
  v_dispatch_secret := coalesce(v_runtime_secret, v_dispatch_secret);

  if v_setting_limit_raw ~ '^[0-9]{1,3}$' then
    v_setting_limit := greatest(1, least(v_setting_limit_raw::integer, 100));
  end if;

  if v_runtime_limit is not null then
    v_setting_limit := greatest(1, least(v_runtime_limit, 100));
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, v_setting_limit, 25), 100));

  if v_function_url is null or v_dispatch_secret is null then
    return null;
  end if;

  if v_channel not in ('', 'email', 'whatsapp') then
    return null;
  end if;

  v_body := jsonb_build_object(
    'dryRun', coalesce(p_dry_run, false),
    'limit', v_limit,
    'source', v_source
  );

  if v_channel <> '' then
    v_body := v_body || jsonb_build_object('channel', v_channel);
  end if;

  select net.http_post(
    url := v_function_url,
    body := v_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kc-dispatch-secret', v_dispatch_secret
    ),
    timeout_milliseconds := 30000
  )
    into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.kc_trigger_notification_dispatch(text, integer, boolean, text) is
  'Queues kc-dispatch-notification-outbox through pg_net with a 30 second response timeout.';

revoke all on function public.kc_trigger_notification_dispatch(text, integer, boolean, text)
  from public, anon, authenticated;
grant execute on function public.kc_trigger_notification_dispatch(text, integer, boolean, text)
  to service_role;
