-- ============================================================
-- KinoCampus — V8.4.4.0
-- Security Fix: function_search_path_mutable
--
-- Resolve o WARNING do Performance Advisor "Function Search Path Mutable"
-- adicionando SET search_path = public a 10 funções que estavam sem esse
-- parâmetro, expondo-as a ataques de injeção via search_path manipulation.
--
-- Funções corrigidas:
--   1. kc_bump_post             (SECURITY DEFINER, plpgsql)
--   2. kc_renew_post            (SECURITY DEFINER, plpgsql)
--   3. kc_toggle_post_status    (SECURITY DEFINER, plpgsql)
--   4. kc_set_post_expires_at   (SECURITY DEFINER, trigger plpgsql)
--   5. kc_increment_location_usage  (SECURITY DEFINER, plpgsql)
--   6. kc_upsert_custom_location    (SECURITY DEFINER, plpgsql)
--   7. kc_get_profile_highlights    (sql STABLE)
--   8. kc_get_profile_highlights_count (sql STABLE)
--   9. kc_profile_initial_display_name (sql IMMUTABLE)
--  10. kc_profile_initial_avatar_url   (sql IMMUTABLE)
--
-- NOTA: os corpos das funções refletem o estado atual do banco de produção
-- (incluindo ajustes feitos após as migrações originais, ex: cooldown=1 dia,
-- módulo caronas com 7 dias de expiração).
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. kc_bump_post — Impulsionar post para o topo (cooldown 1 dia)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_bump_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid;
  v_post          record;
  v_cooldown_days int := 1;
  v_next_bump_at  timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária.');
  end if;

  perform set_config('row_security', 'off', true);
  select id, author_id, status, bumped_at
  into v_post from public.posts where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.');
  end if;

  if v_post.author_id != v_user_id then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode impulsionar esta publicação.');
  end if;

  if v_post.status != 'published' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS',
      'message', 'Apenas publicações ativas podem ser impulsionadas.');
  end if;

  if v_post.bumped_at is not null
     and v_post.bumped_at > now() - (v_cooldown_days || ' days')::interval then
    v_next_bump_at := v_post.bumped_at + (v_cooldown_days || ' days')::interval;
    return jsonb_build_object(
      'ok', false, 'code', 'COOLDOWN_ACTIVE',
      'message', 'Você já impulsionou este anúncio hoje. Próximo impulso disponível em ' ||
                 to_char(v_next_bump_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || '.',
      'next_bump_at', v_next_bump_at,
      'cooldown_days', v_cooldown_days
    );
  end if;

  update public.posts set bumped_at = now(), updated_at = now() where id = p_post_id;

  begin
    insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
    values ('post_bumped', 'posts', p_post_id, v_user_id,
            jsonb_build_object('bumped_at', now(), 'source', 'user_bump'));
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true, 'code', 'OK',
    'bumped_at', now(),
    'next_bump_at', now() + (v_cooldown_days || ' days')::interval,
    'message', 'Anúncio impulsionado! Ele aparece agora no topo dos Recentes.'
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. kc_renew_post — Renova post expirado/oculto (7d caronas, 30d demais)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_renew_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid;
  v_post       record;
  v_check      jsonb;
  v_expires_at timestamptz;
  v_days       int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária.');
  end if;

  perform set_config('row_security', 'off', true);
  select id, author_id, status, module into v_post from public.posts where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.');
  end if;

  if v_post.author_id != v_user_id then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode renovar esta publicação.');
  end if;

  if v_post.status not in ('expired', 'hidden') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS',
      'message', 'Apenas publicações expiradas ou desabilitadas podem ser renovadas (status atual: ' || v_post.status || ').');
  end if;

  v_check := kc_check_post_limit(v_user_id, v_post.module);
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object(
      'ok', false, 'code', 'LIMIT_REACHED',
      'message', 'Você já tem o máximo de publicações ativas (' || (v_check->>'limit') || '). Desabilite ou exclua outra antes de renovar esta.',
      'limit', (v_check->>'limit')::int,
      'count', (v_check->>'count')::int,
      'module', v_post.module
    );
  end if;

  v_days := case when v_post.module = 'caronas' then 7 else 30 end;
  v_expires_at := now() + (v_days || ' days')::interval;

  update public.posts
  set status = 'published', expires_at = v_expires_at, updated_at = now()
  where id = p_post_id;

  begin
    insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
    values ('post_renewed', 'posts', p_post_id, v_user_id,
            jsonb_build_object('old_status', v_post.status, 'new_status', 'published',
                               'expires_at', v_expires_at, 'source', 'user_renew'));
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true, 'code', 'OK',
    'new_status', 'published',
    'expires_at', v_expires_at,
    'message', 'Publicação renovada com sucesso! Fica disponível por mais ' || v_days || ' dias.'
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. kc_toggle_post_status — Alterna published ↔ hidden
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_toggle_post_status(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid;
  v_post       record;
  v_new_status text;
  v_check      jsonb;
  v_expires_at timestamptz;
  v_days       int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED',
      'message', 'Autenticação necessária para alterar o status da publicação.');
  end if;

  perform set_config('row_security', 'off', true);
  select id, author_id, status, module, expires_at
  into v_post from public.posts where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND',
      'message', 'Publicação não encontrada.');
  end if;

  if v_post.author_id != v_user_id then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN',
      'message', 'Apenas o autor pode alterar o status desta publicação.');
  end if;

  if v_post.status = 'expired' then
    return jsonb_build_object('ok', false, 'code', 'USE_RENEW',
      'message', 'Esta publicação está expirada. Use "Renovar publicação" para reativá-la.');
  end if;

  if v_post.status not in ('published', 'hidden') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS',
      'message', 'Esta publicação está em um estado que não permite ativação/desativação (status: ' || v_post.status || ').');
  end if;

  if v_post.status = 'published' then
    v_new_status := 'hidden';
  else
    v_check := kc_check_post_limit(v_user_id, v_post.module);
    if not (v_check->>'ok')::boolean then
      return jsonb_build_object(
        'ok', false, 'code', 'LIMIT_REACHED',
        'message', 'Você já tem o máximo de publicações ativas permitidas (' || (v_check->>'limit') || '). Desabilite ou exclua outra publicação antes de reativar esta.',
        'limit', (v_check->>'limit')::int,
        'count', (v_check->>'count')::int,
        'module', v_post.module
      );
    end if;
    v_new_status := 'published';
    v_days := case when v_post.module = 'caronas' then 7 else 30 end;
    v_expires_at := now() + (v_days || ' days')::interval;
  end if;

  update public.posts
  set status     = v_new_status,
      expires_at = case when v_new_status = 'published' then v_expires_at else v_post.expires_at end,
      updated_at = now()
  where id = p_post_id;

  begin
    insert into public.audit_log (action, entity_type, entity_id, actor_id, payload)
    values ('post_status_changed', 'posts', p_post_id, v_user_id,
            jsonb_build_object('old_status', v_post.status, 'new_status', v_new_status,
                               'source', 'user_toggle'));
  exception when others then null;
  end;

  return jsonb_build_object(
    'ok', true, 'code', 'OK',
    'new_status', v_new_status,
    'expires_at', case when v_new_status = 'published' then v_expires_at else null end,
    'message', case
                 when v_new_status = 'hidden' then 'Anúncio desabilitado. Ele não aparece mais nos feeds.'
                 else 'Anúncio reativado! Fica disponível por ' || v_days || ' dias.'
               end
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. kc_set_post_expires_at — Trigger: define expires_at ao criar post
--    (7 dias para caronas, 30 dias para demais módulos)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_set_post_expires_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expires_at is null then
    new.expires_at := now() + case
      when new.module = 'caronas' then interval '7 days'
      else interval '30 days'
    end;
  end if;
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. kc_increment_location_usage — Incrementa uso de localização de carona
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_increment_location_usage(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.caronas_locations
  set usage_count = usage_count + 1, updated_at = now()
  where key = p_key;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. kc_upsert_custom_location — Cria ou atualiza localização personalizada de carona
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_upsert_custom_location(p_key text, p_label text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.caronas_locations (key, label, icon, zone_key, zone_label, aliases, usage_count)
  values (p_key, p_label, 'fas fa-map-pin', 'custom', 'Locais Personalizados', array[lower(p_label)], 1)
  on conflict (key) do update
    set usage_count = caronas_locations.usage_count + 1,
        updated_at  = now();
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. kc_get_profile_highlights — Lista destaques de um perfil (paginado)
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_get_profile_highlights(
  p_profile_id uuid,
  p_page integer default 1,
  p_limit integer default 12
)
returns table (
  post_uuid  uuid,
  legacy_id  text,
  title      text,
  created_at timestamptz,
  status     text,
  module     text,
  category   text,
  saved_at   timestamptz,
  save_kinds text[]
)
language sql
stable
set search_path = public
as $$
  with normalized as (
    select greatest(coalesce(p_page, 1), 1) as page_number,
           least(greatest(coalesce(p_limit, 12), 1), 50) as page_size
  ),
  grouped as (
    select
      sp.post_id,
      max(coalesce(sp.updated_at, sp.created_at)) as saved_at
    from public.saved_posts sp
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
    group by sp.post_id
  )
  select
    p.id as post_uuid,
    coalesce(p.legacy_id::text, p.id::text) as legacy_id,
    p.title,
    p.created_at,
    p.status,
    p.module,
    p.category,
    g.saved_at,
    array['highlight']::text[] as save_kinds
  from grouped g
  join public.posts p on p.id = g.post_id
  join public.profiles pr on pr.id = p_profile_id
  cross join normalized n
  where p.status = 'published'
    and (
      (
        coalesce(auth.role(), 'anon') = 'authenticated'
        and coalesce(p.visibility, 'public') in ('public', 'community')
      )
      or (
        coalesce(auth.role(), 'anon') <> 'authenticated'
        and pr.profile_public = true
        and coalesce(p.visibility, 'public') = 'public'
      )
    )
  order by g.saved_at desc, p.created_at desc
  limit (select page_size from normalized)
  offset ((select page_number from normalized) - 1) * (select page_size from normalized);
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. kc_get_profile_highlights_count — Conta destaques públicos de um perfil
-- ──────────────────────────────────────────────────────────────────────────────
create or replace function public.kc_get_profile_highlights_count(p_profile_id uuid)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from (
    select sp.post_id
    from public.saved_posts sp
    join public.posts p on p.id = sp.post_id
    join public.profiles pr on pr.id = p_profile_id
    where sp.user_id = p_profile_id
      and sp.kind = 'highlight'
      and p.status = 'published'
      and (
        (
          coalesce(auth.role(), 'anon') = 'authenticated'
          and coalesce(p.visibility, 'public') in ('public', 'community')
        )
        or (
          coalesce(auth.role(), 'anon') <> 'authenticated'
          and pr.profile_public = true
          and coalesce(p.visibility, 'public') = 'public'
        )
      )
    group by sp.post_id
  ) grouped;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. kc_profile_initial_display_name — Gera display_name inicial a partir de metadados OAuth
--    DROP antes de CREATE para permitir alterar parâmetros padrão (error 42P13)
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.kc_profile_initial_display_name(text, jsonb);
create or replace function public.kc_profile_initial_display_name(
  p_email    text,
  p_metadata jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(
      p_metadata ->> 'display_name',
      p_metadata ->> 'full_name',
      p_metadata ->> 'name',
      p_metadata ->> 'preferred_username'
    )), ''),
    nullif(trim(split_part(coalesce(p_email, ''), '@', 1)), ''),
    'Usuario'
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 10. kc_profile_initial_avatar_url — Gera URL de avatar inicial (OAuth ou DiceBear)
--     DROP antes de CREATE para permitir alterar parâmetros padrão (error 42P13)
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists public.kc_profile_initial_avatar_url(uuid, text, jsonb);
create or replace function public.kc_profile_initial_avatar_url(
  p_user_id  uuid,
  p_email    text,
  p_metadata jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(trim(coalesce(
      p_metadata ->> 'avatar_url',
      p_metadata ->> 'picture'
    )), ''),
    'https://api.dicebear.com/7.x/avataaars/svg?seed='
      || replace(
           coalesce(
             nullif(lower(trim(p_email)), ''),
             lower(p_user_id::text),
             'kinocampus'
           ),
           ' ',
           ''
         )
  );
$$;

commit;
