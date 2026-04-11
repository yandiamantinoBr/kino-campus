-- ============================================================
-- KinoCampus v11.21.0.0 - Canal de e-mail para notificacoes
-- ============================================================
--
-- Objetivo:
--   - permitir claim atomico da fila de entrega externa
--   - registrar tentativas de envio de forma consistente
--   - preparar o dispatcher HTTP para envio real de e-mail
-- ============================================================

begin;

create or replace function public.kc_claim_notification_delivery_batch(
  p_channel text,
  p_limit integer default 25,
  p_worker text default null
)
returns setof public.notification_delivery_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_worker text := coalesce(nullif(trim(p_worker), ''), 'notification-dispatcher');
begin
  if v_channel not in ('email', 'whatsapp') then
    return;
  end if;

  return query
  with candidates as (
    select o.id
      from public.notification_delivery_outbox as o
     where o.channel = v_channel
       and (
         (o.status = 'queued' and coalesce(o.next_attempt_at, now()) <= now())
         or
         (o.status = 'failed' and coalesce(o.next_attempt_at, now()) <= now())
         or
         (o.status = 'processing' and o.locked_at is not null and o.locked_at <= now() - interval '15 minutes')
       )
     order by o.created_at asc
     limit v_limit
     for update skip locked
  ),
  claimed as (
    update public.notification_delivery_outbox as o
       set status = 'processing',
           locked_at = now(),
           locked_by = v_worker
      from candidates
     where o.id = candidates.id
     returning o.*
  )
  select *
    from claimed
   order by created_at asc;
end;
$$;

comment on function public.kc_claim_notification_delivery_batch(text, integer, text) is
  'Claim atomico de um lote do outbox de notificacoes externas, com lock e recuperacao de locks stale.';

create or replace function public.kc_record_notification_delivery_attempt(
  p_outbox_id uuid,
  p_status text,
  p_provider text default null,
  p_response_code text default null,
  p_response_body jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null,
  p_next_attempt_at timestamptz default null
)
returns public.notification_delivery_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(coalesce(nullif(trim(p_status), ''), ''));
  v_provider text := nullif(trim(coalesce(p_provider, '')), '');
  v_response_code text := nullif(trim(coalesce(p_response_code, '')), '');
  v_error_code text := nullif(trim(coalesce(p_error_code, '')), '');
  v_error_message text := nullif(trim(coalesce(p_error_message, '')), '');
  v_response_body jsonb := case
    when jsonb_typeof(coalesce(p_response_body, '{}'::jsonb)) = 'object' then coalesce(p_response_body, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_row public.notification_delivery_outbox;
begin
  if p_outbox_id is null then
    return null;
  end if;

  if v_status not in ('sent', 'failed', 'blocked', 'cancelled', 'skipped') then
    raise exception 'unsupported_delivery_status:%', coalesce(v_status, 'null');
  end if;

  update public.notification_delivery_outbox
     set status = v_status,
         attempts_count = attempts_count + 1,
         last_attempt_at = now(),
         next_attempt_at = case
           when v_status = 'failed' then coalesce(p_next_attempt_at, now())
           when p_next_attempt_at is not null then p_next_attempt_at
           else next_attempt_at
         end,
         locked_at = null,
         locked_by = null,
         sent_at = case
           when v_status = 'sent' then now()
           else sent_at
         end,
         error_code = case
           when v_status = 'sent' then null
           else v_error_code
         end,
         error_message = case
           when v_status = 'sent' then null
           else v_error_message
         end
   where id = p_outbox_id
   returning * into v_row;

  if v_row.id is null then
    return null;
  end if;

  insert into public.notification_delivery_attempts (
    outbox_id,
    channel,
    status,
    provider,
    response_code,
    response_body,
    error_message
  )
  values (
    v_row.id,
    v_row.channel,
    v_status,
    v_provider,
    v_response_code,
    v_response_body,
    v_error_message
  );

  return v_row;
end;
$$;

comment on function public.kc_record_notification_delivery_attempt(uuid, text, text, text, jsonb, text, text, timestamptz) is
  'Registra tentativa de entrega externa e atualiza a row do outbox de forma consistente.';

revoke all on function public.kc_claim_notification_delivery_batch(text, integer, text) from public;
revoke all on function public.kc_record_notification_delivery_attempt(uuid, text, text, text, jsonb, text, text, timestamptz) from public;
grant execute on function public.kc_claim_notification_delivery_batch(text, integer, text) to service_role;
grant execute on function public.kc_record_notification_delivery_attempt(uuid, text, text, text, jsonb, text, text, timestamptz) to service_role;

commit;
