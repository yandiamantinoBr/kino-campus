-- ============================================================
-- KinoCampus v11.20.1.0 - Preferencias de Notificacao
-- ============================================================
--
-- Objetivo:
--   - criar camada privada e separada para preferencias por evento/canal
--   - manter notificacoes in-app como padrao canônico e backfill-safe
--   - respeitar o canal in_app nos triggers atuais sem abrir ainda a trilha
--     externa de e-mail e WhatsApp
-- ============================================================

begin;

create or replace function public.kc_default_notification_preferences()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'comment_on_post', jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'comment_reply',   jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'vote_on_post',    jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'post_expired',    jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'post_reported',   jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false),
    'system',          jsonb_build_object('in_app', true, 'email', false, 'whatsapp', false)
  );
$$;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default public.kc_default_notification_preferences(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Preferencias privadas de notificacao por evento/canal do usuario.';

comment on column public.notification_preferences.preferences is
  'JSONB com eventos conhecidos e canais in_app/email/whatsapp.';

update public.notification_preferences
   set preferences = public.kc_default_notification_preferences()
 where preferences is null
    or jsonb_typeof(preferences) <> 'object';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'notification_preferences_preferences_object_check'
       and conrelid = 'public.notification_preferences'::regclass
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_preferences_object_check
      check (jsonb_typeof(preferences) = 'object');
  end if;
end $$;

drop trigger if exists trg_notification_preferences_set_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.kc_set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own
  on public.notification_preferences for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.notification_preferences to authenticated;

create or replace function public.kc_notification_channel_enabled(
  p_user_id uuid,
  p_event text,
  p_channel text default 'in_app'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel), ''), 'in_app'));
  v_event text := lower(coalesce(nullif(trim(p_event), ''), ''));
  v_preferences jsonb;
  v_event_preferences jsonb;
  v_value jsonb;
begin
  if v_event = '' then
    return false;
  end if;

  if v_channel not in ('in_app', 'email', 'whatsapp') then
    return false;
  end if;

  select preferences
    into v_preferences
  from public.notification_preferences
  where user_id = p_user_id;

  if v_preferences is null or jsonb_typeof(v_preferences) <> 'object' then
    return case when v_channel = 'in_app' then true else false end;
  end if;

  v_event_preferences := v_preferences -> v_event;
  if v_event_preferences is null or jsonb_typeof(v_event_preferences) <> 'object' then
    return case when v_channel = 'in_app' then true else false end;
  end if;

  v_value := v_event_preferences -> v_channel;
  if jsonb_typeof(v_value) = 'boolean' then
    return (v_value = 'true'::jsonb);
  end if;

  return case when v_channel = 'in_app' then true else false end;
end;
$$;

revoke all on function public.kc_notification_channel_enabled(uuid, text, text) from public;
grant execute on function public.kc_notification_channel_enabled(uuid, text, text) to authenticated;

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

  if not public.kc_notification_channel_enabled(v_post.author_id, 'comment_on_post', 'in_app') then
    return new;
  end if;

  select coalesce(display_name, full_name)
    into v_actor_name
  from public.profiles
  where id = new.author_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
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

  if not public.kc_notification_channel_enabled(v_parent.author_id, 'comment_reply', 'in_app') then
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

  insert into public.notifications (user_id, type, title, body, data)
  values (
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
  if new.direction <> 'up' then
    return new;
  end if;

  select id, author_id, title, module
    into v_post
  from public.posts
  where id = new.post_id;

  if v_post is null or v_post.author_id = new.user_id then
    return new;
  end if;

  if not public.kc_notification_channel_enabled(v_post.author_id, 'vote_on_post', 'in_app') then
    return new;
  end if;

  select display_name
    into v_voter
  from public.profiles
  where id = new.user_id;

  v_title := coalesce(v_voter.display_name, 'Alguem') || ' votou no seu post';

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_post.author_id,
    'vote_on_post',
    v_title,
    left(v_post.title, 120),
    jsonb_build_object(
      'post_id', v_post.id::text,
      'post_title', left(v_post.title, 80),
      'actor_id', new.user_id::text,
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
  if not public.kc_notification_channel_enabled(p_author_id, 'post_expired', 'in_app') then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_author_id,
    'post_expired',
    'Seu post expirou',
    left(p_title, 120),
    jsonb_build_object(
      'post_id', p_post_id::text,
      'post_title', left(p_title, 80),
      'module', p_module
    )
  );
exception when others then
  null;
end;
$$;

commit;
