-- ============================================================
-- KinoCampus v11.22.0.0 - Notification dispatch scheduler
-- ============================================================
--
-- Objective:
--   - version the automatic consumption of notification_delivery_outbox
--   - create a private run log for dry-run/dispatch observability
--   - keep provider secrets out of the repository
--   - fail closed when runtime settings are not configured
-- ============================================================

begin;

create table if not exists public.notification_dispatch_runtime (
  slot text primary key default 'primary',
  function_url text null,
  dispatch_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  batch_limit integer not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_dispatch_runtime_slot_check
    check (slot = 'primary'),
  constraint notification_dispatch_runtime_batch_limit_check
    check (batch_limit between 1 and 100)
);

comment on table public.notification_dispatch_runtime is
  'Private runtime settings for the notification dispatcher scheduler. Versioned in schema, populated out of git.';

drop trigger if exists trg_notification_dispatch_runtime_set_updated_at on public.notification_dispatch_runtime;
create trigger trg_notification_dispatch_runtime_set_updated_at
before update on public.notification_dispatch_runtime
for each row execute function public.kc_set_updated_at();

alter table public.notification_dispatch_runtime enable row level security;
revoke all on table public.notification_dispatch_runtime from public, anon, authenticated;
grant select, insert, update on table public.notification_dispatch_runtime to service_role;

insert into public.notification_dispatch_runtime (slot)
values ('primary')
on conflict (slot) do nothing;

create table if not exists public.notification_dispatch_runs (
  id uuid primary key default gen_random_uuid(),
  execution_id text null,
  source text not null default 'manual',
  mode text not null,
  channel_filter text null,
  status text not null default 'completed',
  batch_limit integer not null default 25,
  provider_ready jsonb not null default '{}'::jsonb,
  provider_issues jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint notification_dispatch_runs_mode_check
    check (mode = any (array['dry_run'::text, 'dispatch'::text])),
  constraint notification_dispatch_runs_channel_filter_check
    check (channel_filter is null or channel_filter = any (array['email'::text, 'whatsapp'::text])),
  constraint notification_dispatch_runs_status_check
    check (status = any (array['completed'::text, 'error'::text])),
  constraint notification_dispatch_runs_provider_ready_object_check
    check (jsonb_typeof(provider_ready) = 'object'),
  constraint notification_dispatch_runs_provider_issues_object_check
    check (jsonb_typeof(provider_issues) = 'object'),
  constraint notification_dispatch_runs_summary_object_check
    check (jsonb_typeof(summary) = 'object')
);

comment on table public.notification_dispatch_runs is
  'Private operational log for dry-run/dispatch executions of the external notification dispatcher.';

create index if not exists idx_notification_dispatch_runs_created
  on public.notification_dispatch_runs (created_at desc);

create index if not exists idx_notification_dispatch_runs_source_created
  on public.notification_dispatch_runs (source, created_at desc);

alter table public.notification_dispatch_runs enable row level security;
revoke all on table public.notification_dispatch_runs from public, anon, authenticated;
grant select, insert on table public.notification_dispatch_runs to service_role;

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
    timeout_milliseconds := 5000
  )
    into v_request_id;

  return v_request_id;
end;
$$;

comment on function public.kc_trigger_notification_dispatch(text, integer, boolean, text) is
  'Triggers the kc-dispatch-notification-outbox Edge Function through pg_net using database-level runtime settings.';

revoke all on function public.kc_trigger_notification_dispatch(text, integer, boolean, text) from public;
grant execute on function public.kc_trigger_notification_dispatch(text, integer, boolean, text) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('kc-dispatch-notification-outbox');
    exception
      when invalid_parameter_value then
        null;
      when undefined_function then
        null;
      when others then
        null;
    end;

    perform cron.schedule(
      'kc-dispatch-notification-outbox',
      '*/5 * * * *',
      'select public.kc_trigger_notification_dispatch();'
    );
  end if;
end
$$;

commit;

-- Runtime configuration:
-- 1) Preferred, versioned path:
--      update public.notification_dispatch_runtime
--         set function_url = 'https://<PROJECT_REF>.functions.supabase.co/kc-dispatch-notification-outbox',
--             batch_limit = 25
--       where slot = 'primary';
--    `dispatch_secret` is generated automatically on insert and must stay private.
--
-- 2) Fallback escape hatch, outside git:
-- alter database postgres set app.settings.kc_notification_dispatch_function_url =
--   'https://<PROJECT_REF>.functions.supabase.co/kc-dispatch-notification-outbox';
-- alter database postgres set app.settings.kc_notification_dispatch_secret =
--   '<same-value-as-KC_NOTIFICATION_DISPATCH_SECRET>';
-- alter database postgres set app.settings.kc_notification_dispatch_batch_limit = '25';
