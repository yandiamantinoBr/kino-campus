-- ============================================================
-- KinoCampus v11.21.1.0 - Canal WhatsApp para notificacoes
-- ============================================================
--
-- Objetivo:
--   - criar camada privada para o destino de notificacoes via WhatsApp
--   - manter o WhatsApp publico do perfil fora da trilha de entrega privada
--   - exigir consentimento explicito antes de liberar o canal no outbox
--   - expor helper seguro para rate-limit operacional por janela recente
-- ============================================================

begin;

create table if not exists public.notification_channel_targets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  destination text not null,
  consent_granted boolean not null default false,
  consent_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, channel),
  constraint notification_channel_targets_channel_check
    check (channel = any (array['whatsapp'::text])),
  constraint notification_channel_targets_destination_e164_check
    check (destination ~ '^\+[1-9][0-9]{7,14}$'),
  constraint notification_channel_targets_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.notification_channel_targets is
  'Destinos privados de notificacao por canal. Nao deve reaproveitar contatos publicos do perfil.';

comment on column public.notification_channel_targets.destination is
  'Destino privado normalizado em E.164. Para WhatsApp, deve ser um numero valido com prefixo +.';

comment on column public.notification_channel_targets.metadata is
  'Metadados operacionais do destino privado. Ex.: country_code usado no formulario.';

drop trigger if exists trg_notification_channel_targets_set_updated_at on public.notification_channel_targets;
create trigger trg_notification_channel_targets_set_updated_at
before update on public.notification_channel_targets
for each row execute function public.kc_set_updated_at();

create or replace function public.kc_touch_notification_channel_target_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.consent_granted is true then
    if tg_op = 'INSERT'
       or old.consent_granted is distinct from true
       or old.destination is distinct from new.destination then
      new.consent_at := now();
    end if;
  else
    new.consent_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notification_channel_targets_touch_consent on public.notification_channel_targets;
create trigger trg_notification_channel_targets_touch_consent
before insert or update on public.notification_channel_targets
for each row execute function public.kc_touch_notification_channel_target_consent();

alter table public.notification_channel_targets enable row level security;

drop policy if exists notification_channel_targets_select_own on public.notification_channel_targets;
create policy notification_channel_targets_select_own
  on public.notification_channel_targets for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_channel_targets_insert_own on public.notification_channel_targets;
create policy notification_channel_targets_insert_own
  on public.notification_channel_targets for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notification_channel_targets_update_own on public.notification_channel_targets;
create policy notification_channel_targets_update_own
  on public.notification_channel_targets for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notification_channel_targets_delete_own on public.notification_channel_targets;
create policy notification_channel_targets_delete_own
  on public.notification_channel_targets for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.notification_channel_targets to authenticated;
grant select, insert, update, delete on table public.notification_channel_targets to service_role;

create or replace function public.kc_count_recent_notification_deliveries(
  p_user_id uuid,
  p_channel text,
  p_since timestamptz default now() - interval '60 minutes'
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.notification_delivery_outbox as o
   where o.user_id = p_user_id
     and lower(coalesce(o.channel, '')) = lower(coalesce(p_channel, ''))
     and o.status = 'sent'
     and o.sent_at is not null
     and o.sent_at >= coalesce(p_since, now() - interval '60 minutes');
$$;

comment on function public.kc_count_recent_notification_deliveries(uuid, text, timestamptz) is
  'Conta entregas recentes por usuario/canal para rate-limit operacional do dispatcher.';

create or replace function public.kc_resolve_notification_delivery_destination(
  p_user_id uuid,
  p_channel text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_email text;
  v_whatsapp_destination text;
  v_whatsapp_consent boolean;
begin
  if p_user_id is null or v_channel = '' then
    return jsonb_build_object(
      'available', false,
      'reason', 'invalid_input',
      'destination_source', 'none'
    );
  end if;

  if v_channel = 'email' then
    select nullif(trim(coalesce(u.email, '')), '')
      into v_email
    from auth.users as u
    where u.id = p_user_id;

    if v_email is null then
      return jsonb_build_object(
        'available', false,
        'reason', 'missing_email',
        'destination_source', 'auth.users.email'
      );
    end if;

    return jsonb_build_object(
      'available', true,
      'destination', lower(v_email),
      'destination_source', 'auth.users.email'
    );
  end if;

  if v_channel = 'whatsapp' then
    select t.destination, t.consent_granted
      into v_whatsapp_destination, v_whatsapp_consent
    from public.notification_channel_targets as t
    where t.user_id = p_user_id
      and t.channel = 'whatsapp';

    if nullif(trim(coalesce(v_whatsapp_destination, '')), '') is null then
      return jsonb_build_object(
        'available', false,
        'reason', 'private_destination_not_configured',
        'destination_source', 'private.notification_channel_targets.whatsapp'
      );
    end if;

    if coalesce(v_whatsapp_consent, false) is not true then
      return jsonb_build_object(
        'available', false,
        'reason', 'consent_not_granted',
        'destination_source', 'private.notification_channel_targets.whatsapp'
      );
    end if;

    if v_whatsapp_destination !~ '^\+[1-9][0-9]{7,14}$' then
      return jsonb_build_object(
        'available', false,
        'reason', 'invalid_destination',
        'destination_source', 'private.notification_channel_targets.whatsapp'
      );
    end if;

    return jsonb_build_object(
      'available', true,
      'destination', v_whatsapp_destination,
      'destination_source', 'private.notification_channel_targets.whatsapp'
    );
  end if;

  return jsonb_build_object(
    'available', false,
    'reason', 'unsupported_channel',
    'destination_source', 'none'
  );
end;
$$;

revoke all on function public.kc_touch_notification_channel_target_consent() from public;
revoke all on function public.kc_count_recent_notification_deliveries(uuid, text, timestamptz) from public;
revoke all on function public.kc_resolve_notification_delivery_destination(uuid, text) from public;
grant execute on function public.kc_touch_notification_channel_target_consent() to service_role;
grant execute on function public.kc_count_recent_notification_deliveries(uuid, text, timestamptz) to service_role;
grant execute on function public.kc_resolve_notification_delivery_destination(uuid, text) to service_role;

commit;
