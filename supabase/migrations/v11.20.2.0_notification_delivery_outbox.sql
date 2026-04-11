-- ============================================================
-- KinoCampus v11.20.2.0 - Fundacao assincrona de entrega externa
-- ============================================================
--
-- Objetivo:
--   - criar fila privada para entregas externas futuras (email / whatsapp)
--   - registrar tentativas sem acoplar provider aos triggers principais
--   - manter notificacoes in-app como trilha canonica independente
--   - permitir eventos externos mesmo quando in_app estiver desligado
-- ============================================================

begin;

create table if not exists public.notification_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid null references public.notifications(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  channel text not null,
  status text not null default 'queued',
  destination text null,
  destination_source text null,
  payload jsonb not null default '{}'::jsonb,
  attempts_count integer not null default 0,
  last_attempt_at timestamptz null,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  sent_at timestamptz null,
  error_code text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_delivery_outbox_event_type_check
    check (event_type = any (array[
      'comment_on_post'::text,
      'comment_reply'::text,
      'vote_on_post'::text,
      'post_expired'::text,
      'post_reported'::text,
      'system'::text
    ])),
  constraint notification_delivery_outbox_channel_check
    check (channel = any (array['email'::text, 'whatsapp'::text])),
  constraint notification_delivery_outbox_status_check
    check (status = any (array[
      'queued'::text,
      'processing'::text,
      'sent'::text,
      'failed'::text,
      'blocked'::text,
      'cancelled'::text,
      'skipped'::text
    ])),
  constraint notification_delivery_outbox_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

comment on table public.notification_delivery_outbox is
  'Fila privada de entrega externa de notificacoes (email/whatsapp), desacoplada dos triggers principais.';

comment on column public.notification_delivery_outbox.notification_id is
  'Referencia opcional para a notificacao in-app correspondente. Pode ser nula quando o usuario desligou in_app e manteve apenas canais externos.';

comment on column public.notification_delivery_outbox.destination_source is
  'Origem resolvida do destino privado. Ex.: auth.users.email. Nao deve reaproveitar contato publico do perfil.';

create unique index if not exists notification_delivery_outbox_notification_channel_uidx
  on public.notification_delivery_outbox (notification_id, channel);

create index if not exists idx_notification_delivery_outbox_status_next_attempt
  on public.notification_delivery_outbox (status, next_attempt_at, created_at)
  where status in ('queued', 'failed', 'processing');

create index if not exists idx_notification_delivery_outbox_user_created
  on public.notification_delivery_outbox (user_id, created_at desc);

create index if not exists idx_notification_delivery_outbox_channel_status
  on public.notification_delivery_outbox (channel, status, next_attempt_at);

drop trigger if exists trg_notification_delivery_outbox_set_updated_at on public.notification_delivery_outbox;
create trigger trg_notification_delivery_outbox_set_updated_at
before update on public.notification_delivery_outbox
for each row execute function public.kc_set_updated_at();

alter table public.notification_delivery_outbox enable row level security;
revoke all on table public.notification_delivery_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_delivery_outbox to service_role;

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_delivery_outbox(id) on delete cascade,
  channel text not null,
  status text not null,
  provider text null,
  response_code text null,
  response_body jsonb not null default '{}'::jsonb,
  error_message text null,
  attempted_at timestamptz not null default now(),
  constraint notification_delivery_attempts_channel_check
    check (channel = any (array['email'::text, 'whatsapp'::text])),
  constraint notification_delivery_attempts_status_check
    check (status = any (array[
      'processing'::text,
      'sent'::text,
      'failed'::text,
      'blocked'::text,
      'cancelled'::text,
      'skipped'::text
    ])),
  constraint notification_delivery_attempts_response_body_object_check
    check (jsonb_typeof(response_body) = 'object')
);

comment on table public.notification_delivery_attempts is
  'Historico imutavel das tentativas de entrega externa para cada item do outbox.';

create index if not exists idx_notification_delivery_attempts_outbox_attempted
  on public.notification_delivery_attempts (outbox_id, attempted_at desc);

create index if not exists idx_notification_delivery_attempts_channel_status
  on public.notification_delivery_attempts (channel, status, attempted_at desc);

alter table public.notification_delivery_attempts enable row level security;
revoke all on table public.notification_delivery_attempts from public, anon, authenticated;
grant select, insert on table public.notification_delivery_attempts to service_role;

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
begin
  if p_user_id is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'missing_user',
      'destination_source', 'none'
    );
  end if;

  if v_channel = 'email' then
    select nullif(trim(u.email), '')
      into v_email
      from auth.users as u
     where u.id = p_user_id;

    if v_email is null then
      return jsonb_build_object(
        'available', false,
        'reason', 'destination_unavailable',
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
    return jsonb_build_object(
      'available', false,
      'reason', 'private_destination_not_configured',
      'destination_source', 'private.whatsapp'
    );
  end if;

  return jsonb_build_object(
    'available', false,
    'reason', 'unsupported_channel',
    'destination_source', 'none'
  );
end;
$$;

create or replace function public.kc_build_notification_delivery_payload(
  p_event_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_notification_id uuid default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'event_type', lower(coalesce(nullif(trim(p_event_type), ''), 'system')),
      'title', coalesce(p_title, ''),
      'body', coalesce(p_body, ''),
      'data', case
        when jsonb_typeof(coalesce(p_data, '{}'::jsonb)) = 'object' then coalesce(p_data, '{}'::jsonb)
        else '{}'::jsonb
      end,
      'notification_id', case
        when p_notification_id is null then null
        else to_jsonb(p_notification_id::text)
      end
    )
  );
$$;

create or replace function public.kc_enqueue_notification_delivery(
  p_user_id uuid,
  p_event_type text,
  p_channel text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_notification_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), ''));
  v_resolution jsonb;
  v_available boolean := false;
  v_destination text;
  v_destination_source text;
  v_reason text;
  v_status text := 'queued';
  v_outbox_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if v_channel not in ('email', 'whatsapp') then
    return null;
  end if;

  v_resolution := public.kc_resolve_notification_delivery_destination(p_user_id, v_channel);
  v_available := coalesce((v_resolution ->> 'available')::boolean, false);
  v_destination := nullif(trim(coalesce(v_resolution ->> 'destination', '')), '');
  v_destination_source := nullif(trim(coalesce(v_resolution ->> 'destination_source', '')), '');
  v_reason := nullif(trim(coalesce(v_resolution ->> 'reason', '')), '');
  v_status := case when v_available then 'queued' else 'blocked' end;

  insert into public.notification_delivery_outbox (
    notification_id,
    user_id,
    event_type,
    channel,
    status,
    destination,
    destination_source,
    payload,
    error_code,
    error_message
  )
  values (
    p_notification_id,
    p_user_id,
    lower(coalesce(nullif(trim(p_event_type), ''), 'system')),
    v_channel,
    v_status,
    v_destination,
    v_destination_source,
    public.kc_build_notification_delivery_payload(
      p_event_type,
      p_title,
      p_body,
      p_data,
      p_notification_id
    ),
    case when v_status = 'blocked' then coalesce(v_reason, 'destination_unavailable') else null end,
    case
      when v_status <> 'blocked' then null
      when v_reason = 'private_destination_not_configured' then 'Destino privado ainda nao configurado para este canal.'
      when v_reason = 'missing_user' then 'Usuario de destino ausente para a entrega externa.'
      when v_reason = 'unsupported_channel' then 'Canal externo ainda nao suportado.'
      else 'Destino privado indisponivel para a entrega externa.'
    end
  )
  on conflict (notification_id, channel) do update
    set user_id = excluded.user_id,
        event_type = excluded.event_type,
        status = excluded.status,
        destination = excluded.destination,
        destination_source = excluded.destination_source,
        payload = excluded.payload,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        next_attempt_at = excluded.next_attempt_at,
        locked_at = null,
        locked_by = null
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$$;

create or replace function public.kc_emit_notification_event(
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := lower(coalesce(nullif(trim(p_event_type), ''), 'system'));
  v_data jsonb := case
    when jsonb_typeof(coalesce(p_data, '{}'::jsonb)) = 'object' then coalesce(p_data, '{}'::jsonb)
    else '{}'::jsonb
  end;
  v_title text := coalesce(p_title, '');
  v_body text := coalesce(p_body, '');
  v_notification_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if public.kc_notification_channel_enabled(p_user_id, v_event_type, 'in_app') then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, v_event_type, v_title, v_body, v_data)
    returning id into v_notification_id;
  end if;

  if public.kc_notification_channel_enabled(p_user_id, v_event_type, 'email') then
    perform public.kc_enqueue_notification_delivery(
      p_user_id,
      v_event_type,
      'email',
      v_title,
      v_body,
      v_data,
      v_notification_id
    );
  end if;

  if public.kc_notification_channel_enabled(p_user_id, v_event_type, 'whatsapp') then
    perform public.kc_enqueue_notification_delivery(
      p_user_id,
      v_event_type,
      'whatsapp',
      v_title,
      v_body,
      v_data,
      v_notification_id
    );
  end if;

  return v_notification_id;
end;
$$;

revoke all on function public.kc_resolve_notification_delivery_destination(uuid, text) from public;
revoke all on function public.kc_build_notification_delivery_payload(text, text, text, jsonb, uuid) from public;
revoke all on function public.kc_enqueue_notification_delivery(uuid, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.kc_emit_notification_event(uuid, text, text, text, jsonb) from public;
grant execute on function public.kc_resolve_notification_delivery_destination(uuid, text) to service_role;
grant execute on function public.kc_build_notification_delivery_payload(text, text, text, jsonb, uuid) to service_role;
grant execute on function public.kc_enqueue_notification_delivery(uuid, text, text, text, text, jsonb, uuid) to service_role;
grant execute on function public.kc_emit_notification_event(uuid, text, text, text, jsonb) to service_role;

create or replace function public.kc_notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_actor_name text;
begin
  select id, author_id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  if v_post is null or v_post.author_id = new.author_id then
    return new;
  end if;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  perform public.kc_emit_notification_event(
    v_post.author_id,
    'comment_on_post',
    coalesce(v_actor_name, 'Alguem') || ' comentou no seu post',
    left(coalesce(new.body, ''), 120),
    jsonb_build_object(
      'post_id', v_post.id::text,
      'post_title', left(coalesce(v_post.title, ''), 80),
      'comment_id', new.id::text,
      'actor_id', new.author_id::text,
      'actor_name', coalesce(v_actor_name, ''),
      'module', v_post.module
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.kc_notify_on_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent record;
  v_post record;
  v_actor_name text;
begin
  if new.parent_id is null then
    return new;
  end if;

  select id, author_id, post_id
    into v_parent
  from public.comments
  where id = new.parent_id;

  if v_parent is null or v_parent.author_id = new.author_id then
    return new;
  end if;

  select id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  perform public.kc_emit_notification_event(
    v_parent.author_id,
    'comment_reply',
    coalesce(v_actor_name, 'Alguem') || ' respondeu seu comentario',
    left(coalesce(new.body, ''), 120),
    jsonb_build_object(
      'post_id', new.post_id::text,
      'post_title', left(coalesce(v_post.title, ''), 80),
      'comment_id', new.id::text,
      'parent_comment_id', new.parent_id::text,
      'actor_id', new.author_id::text,
      'actor_name', coalesce(v_actor_name, ''),
      'module', coalesce(v_post.module, '')
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.kc_notify_on_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_voter record;
  v_title text;
begin
  if new.direction <> 'hot' then
    return new;
  end if;

  select id, author_id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  if v_post is null or v_post.author_id = new.voter_id then
    return new;
  end if;

  select display_name
    into v_voter
  from public.profiles
  where id = new.voter_id;

  v_title := coalesce(v_voter.display_name, 'Alguem') || ' votou no seu post';

  perform public.kc_emit_notification_event(
    v_post.author_id,
    'vote_on_post',
    v_title,
    left(v_post.title, 120),
    jsonb_build_object(
      'post_id', v_post.id::text,
      'post_title', left(v_post.title, 80),
      'actor_id', new.voter_id::text,
      'actor_name', coalesce(v_voter.display_name, ''),
      'module', v_post.module
    )
  );

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.kc_notify_on_post_expire(
  p_post_id uuid,
  p_author_id uuid,
  p_title text,
  p_module text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.kc_emit_notification_event(
    p_author_id,
    'post_expired',
    'Seu post expirou',
    left(coalesce(p_title, ''), 120),
    jsonb_build_object(
      'post_id', p_post_id::text,
      'post_title', left(coalesce(p_title, ''), 80),
      'module', p_module
    )
  );
exception when others then
  null;
end;
$$;

commit;
