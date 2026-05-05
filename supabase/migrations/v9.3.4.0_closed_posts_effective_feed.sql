-- KinoCampus v9.3.4.0
-- Closed posts as public history + effective feed ordering.

begin;

alter table public.posts
  drop constraint if exists posts_status_check;

alter table public.posts
  add constraint posts_status_check
  check (status in ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'reports_reason_check'
      and conrelid = 'public.reports'::regclass
  ) then
    alter table public.reports drop constraint reports_reason_check;
  end if;
end $$;

alter table public.reports
  add constraint reports_reason_check
  check (reason in (
    'spam',
    'scam',
    'inappropriate',
    'hate',
    'illegal',
    'duplicate',
    'other',
    'harassment',
    'offensive',
    'misleading',
    'privacy',
    'post_closed'
  ));

create or replace function public.kc_can_read_post(
  p_author_id uuid,
  p_status text,
  p_visibility text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(auth.role(), 'anon') = 'authenticated' then
      (
        (coalesce(p_status, 'published') in ('published', 'closed') and coalesce(p_visibility, 'public') in ('public', 'community'))
        or (select auth.uid()) = p_author_id
        or public.kc_is_admin((select auth.uid()))
      )
    else
      (
        coalesce(p_status, 'published') in ('published', 'closed')
        and coalesce(p_visibility, 'public') = 'public'
      )
  end;
$$;

revoke all on function public.kc_can_read_post(uuid, text, text) from public;
grant execute on function public.kc_can_read_post(uuid, text, text) to anon, authenticated;

create or replace function public.kc_report_post(
  p_post_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_reason text;
  v_details text;
  v_report_id uuid;
begin
  v_uid := auth.uid();
  v_reason := lower(trim(coalesce(p_reason, '')));
  v_details := nullif(left(trim(coalesce(p_details, '')), 1000), '');

  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para denunciar.');
  end if;

  if v_reason not in ('spam', 'scam', 'inappropriate', 'hate', 'illegal', 'duplicate', 'other', 'post_closed') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Selecione um motivo valido.');
  end if;

  if not exists (
    select 1
    from public.posts
    where id = p_post_id
      and status in ('published', 'closed')
  ) then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado para denuncia.');
  end if;

  begin
    insert into public.reports (post_id, reporter_id, reason, details, status)
    values (p_post_id, v_uid, v_reason, v_details, 'open')
    returning id into v_report_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'ALREADY_REPORTED', 'message', 'Voce ja denunciou este post.');
  end;

  return jsonb_build_object('ok', true, 'id', v_report_id, 'post_id', p_post_id);
end;
$$;

revoke all on function public.kc_report_post(uuid, text, text) from public;
grant execute on function public.kc_report_post(uuid, text, text) to authenticated, service_role;

create or replace function public.kc_close_post(
  p_post_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_post record;
  v_reason text := nullif(left(trim(coalesce(p_reason, 'owner_closed')), 80), '');
  v_closed_at timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para encerrar a publicacao.');
  end if;

  select id, author_id, status
    into v_post
    from public.posts
   where id = p_post_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Publicacao nao encontrada.');
  end if;

  if v_post.author_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas o dono pode encerrar esta publicacao.');
  end if;

  if v_post.status = 'closed' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CLOSED', 'status', 'closed', 'new_status', 'closed', 'message', 'Publicacao ja encerrada.');
  end if;

  if v_post.status not in ('published', 'hidden', 'expired') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Esta publicacao nao pode ser encerrada neste status.');
  end if;

  update public.posts
     set status = 'closed',
         updated_at = v_closed_at,
         metadata = jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_closed_at::text), true),
             '{closed_by}', to_jsonb(v_uid::text), true
           ),
           '{closed_reason}', to_jsonb(coalesce(v_reason, 'owner_closed')), true
         )
   where id = p_post_id;

  begin
    insert into public.audit_log(action, entity_type, entity_id, actor_id, metadata)
    values (
      'post_closed',
      'posts',
      p_post_id,
      v_uid,
      jsonb_build_object('source', 'owner', 'reason', coalesce(v_reason, 'owner_closed'))
    );
  exception
    when undefined_table then null;
    when insufficient_privilege then null;
  end;

  return jsonb_build_object(
    'ok', true,
    'status', 'closed',
    'new_status', 'closed',
    'closed_at', v_closed_at,
    'message', 'Publicacao encerrada.'
  );
end;
$$;

revoke all on function public.kc_close_post(uuid, text) from public;
grant execute on function public.kc_close_post(uuid, text) to authenticated, service_role;

create or replace function public.kc_admin_set_post_status(
  p_post_id uuid,
  p_status text,
  p_close_reports boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_status text;
  v_post_exists boolean;
  v_updated integer := 0;
  v_closed integer := 0;
  v_now timestamptz := now();
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED', 'message', 'Faca login para moderar.');
  end if;

  if not public.kc_is_admin(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Apenas administradores podem moderar posts.');
  end if;

  v_status := lower(trim(coalesce(p_status, '')));
  if v_status not in ('published', 'pending', 'hidden', 'deleted', 'expired', 'closed') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Status de moderacao invalido: ' || coalesce(v_status, '(vazio)'));
  end if;

  set local row_security = off;

  select exists(select 1 from public.posts where id = p_post_id) into v_post_exists;
  if not v_post_exists then
    return jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Post nao encontrado: ' || coalesce(p_post_id::text, '(null)'));
  end if;

  update public.posts
     set status = v_status,
         updated_at = v_now,
         metadata = case
           when v_status = 'closed' then jsonb_set(
             jsonb_set(
               jsonb_set(coalesce(metadata, '{}'::jsonb), '{closed_at}', to_jsonb(v_now::text), true),
               '{closed_by}', to_jsonb(v_uid::text), true
             ),
             '{closed_reason}', to_jsonb('admin_closed'::text), true
           )
           else metadata
         end
   where id = p_post_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'code', 'UPDATE_NOT_APPLIED', 'message', 'O UPDATE nao afetou nenhuma linha.', 'post_id', p_post_id, 'status', v_status);
  end if;

  if p_close_reports then
    update public.reports
       set status = 'closed'
     where post_id = p_post_id
       and status = 'open';
    get diagnostics v_closed = row_count;
  end if;

  return jsonb_build_object('ok', true, 'code', 'OK', 'updated_posts', v_updated, 'closed_reports', v_closed, 'post_id', p_post_id, 'status', v_status);
end;
$$;

revoke all on function public.kc_admin_set_post_status(uuid, text, boolean) from public;
grant execute on function public.kc_admin_set_post_status(uuid, text, boolean) to authenticated, service_role;

create or replace function public.kc_get_feed_cursor(
  p_module text default null,
  p_modules text[] default null,
  p_category text default null,
  p_subcategory text default null,
  p_tag text default null,
  p_q text default null,
  p_sort_by text default 'recentes',
  p_limit int default 12,
  p_cursor text default null,
  p_request_params jsonb default null
)
returns jsonb
language plpgsql
set search_path = public
stable
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 12), 50));
  v_sort text := case
    when lower(coalesce(p_sort_by, 'recentes')) = 'votos' then 'votos'
    when lower(coalesce(p_sort_by, 'recentes')) = 'comentados' then 'comentados'
    else 'recentes'
  end;
  v_module_list text[] := array[]::text[];
  v_cursor_json jsonb := null;
  v_cursor_created timestamptz := null;
  v_cursor_id uuid := null;
  v_cursor_highlight double precision := 0;
  v_cursor_votos integer := 0;
  v_cursor_last_comment timestamptz := null;
  v_cursor_effective timestamptz := null;
  v_posts jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor text := null;
  v_date_preset text := null;
  v_price_min numeric := null;
  v_price_max numeric := null;
begin
  if p_modules is not null and array_length(p_modules, 1) > 0 then
    select array_agg(lower(trim(value))) into v_module_list
      from unnest(p_modules) as value
     where nullif(trim(value), '') is not null;
  elsif nullif(trim(coalesce(p_module, '')), '') is not null then
    v_module_list := array[lower(trim(p_module))];
  end if;

  if p_request_params is not null then
    v_date_preset := nullif(trim(coalesce(p_request_params->>'datePreset', p_request_params->>'date_preset', '')), '');
    begin
      v_price_min := nullif(trim(coalesce(p_request_params->>'priceMin', p_request_params->>'price_min', '')), '')::numeric;
    exception when others then
      v_price_min := null;
    end;
    begin
      v_price_max := nullif(trim(coalesce(p_request_params->>'priceMax', p_request_params->>'price_max', '')), '')::numeric;
    exception when others then
      v_price_max := null;
    end;
  end if;

  if nullif(trim(coalesce(p_cursor, '')), '') is not null then
    begin
      v_cursor_json := convert_from(decode(p_cursor, 'base64'), 'utf8')::jsonb;
      v_cursor_created := nullif(v_cursor_json->>'created_at', '')::timestamptz;
      v_cursor_id := nullif(v_cursor_json->>'id', '')::uuid;
      v_cursor_highlight := coalesce(nullif(v_cursor_json->>'highlight_score', '')::double precision, 0);
      v_cursor_votos := coalesce(nullif(v_cursor_json->>'votos', '')::integer, 0);
      v_cursor_last_comment := nullif(v_cursor_json->>'last_comment_at', '')::timestamptz;
      v_cursor_effective := coalesce(
        nullif(v_cursor_json->>'effective_at', '')::timestamptz,
        nullif(v_cursor_json->>'bumped_at', '')::timestamptz,
        v_cursor_created
      );
    exception when others then
      v_cursor_json := null;
    end;
  end if;

  with filtered as (
    select
      p.id,
      p.legacy_id,
      p.author_id,
      p.title,
      p.description,
      p.price,
      p.location,
      p.module,
      p.category,
      p.status,
      p.visibility,
      coalesce(p.metadata, '{}'::jsonb) as metadata,
      p.created_at,
      coalesce(p.votos, 0) as votos,
      coalesce(p.highlight_score, 0) as highlight_score,
      p.bumped_at,
      coalesce(p.bumped_at, p.created_at) as effective_at,
      p.last_comment_at,
      case
        when pr.id is null then null
        else jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'verified', coalesce(pr.verified, false)
        )
      end as profile_payload,
      coalesce(pm.items, '[]'::jsonb) as media_payload,
      coalesce(cc.comment_count, 0) as comment_count
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
    left join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', m.id, 'url', m.url, 'is_cover', m.is_cover)
          order by m.is_cover desc, m.id asc
        ),
        '[]'::jsonb
      ) as items
      from public.post_media m
      where m.post_id = p.id
    ) pm on true
    left join lateral (
      select count(*)::int as comment_count
      from public.comments c
      where c.post_id = p.id
    ) cc on true
    where p.legacy_id is null
      and p.status in ('published', 'closed')
      and public.kc_can_read_post(p.author_id, p.status, p.visibility)
      and (coalesce(array_length(v_module_list, 1), 0) = 0 or lower(coalesce(p.module, '')) = any(v_module_list))
      and (p_category is null or lower(coalesce(p.category, '')) = lower(p_category))
      and (
        p_subcategory is null
        or lower(coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        )) = lower(p_subcategory)
      )
      and (
        p_tag is null
        or coalesce(p.metadata->'tagKeys', '[]'::jsonb) @> jsonb_build_array(lower(p_tag))
      )
      and (
        coalesce(nullif(btrim(p_q), ''), null) is null
        or p.title ilike '%' || btrim(p_q) || '%'
        or p.description ilike '%' || btrim(p_q) || '%'
      )
      and public.kc_matches_feed_request_params(
        p.module,
        p.category,
        coalesce(
          p.metadata->>'subcategory',
          p.metadata->>'subcategoria',
          p.metadata->>'subcategoryKey',
          p.metadata->>'subcategoriaKey',
          ''
        ),
        p.title,
        p.description,
        coalesce(p.metadata, '{}'::jsonb),
        coalesce(pr.verified, false),
        p_request_params
      )
      and public.kc_feed_matches_date_preset(
        p.module,
        p.created_at,
        coalesce(p.metadata, '{}'::jsonb),
        v_date_preset
      )
      and (v_price_min is null or (p.price is not null and p.price >= v_price_min))
      and (v_price_max is null or (p.price is not null and p.price <= v_price_max))
      and (
        v_cursor_json is null
        or (
          v_sort = 'votos'
          and row(coalesce(p.highlight_score, 0), coalesce(p.votos, 0), p.created_at, p.id)
              < row(v_cursor_highlight, v_cursor_votos, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'comentados'
          and p.last_comment_at is not null
          and row(p.last_comment_at, p.created_at, p.id)
              < row(v_cursor_last_comment, v_cursor_created, v_cursor_id)
        )
        or (
          v_sort = 'recentes'
          and row(coalesce(p.bumped_at, p.created_at), p.created_at, p.id)
              < row(v_cursor_effective, v_cursor_created, v_cursor_id)
        )
      )
      and (v_sort <> 'comentados' or p.last_comment_at is not null)
  ),
  limited as (
    select *
    from filtered
    order by
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit + 1
  ),
  kept as (
    select *
    from limited
    order by
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    limit v_limit
  ),
  cursor_row as (
    select *
    from kept
    order by
      case when v_sort = 'votos' then highlight_score end desc nulls last,
      case when v_sort = 'votos' then votos end desc nulls last,
      case when v_sort = 'comentados' then last_comment_at end desc nulls last,
      case when v_sort = 'recentes' then effective_at end desc nulls last,
      created_at desc,
      id desc
    offset greatest(v_limit - 1, 0)
    limit 1
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', kept.id,
          'legacy_id', kept.legacy_id,
          'author_id', kept.author_id,
          'title', kept.title,
          'description', kept.description,
          'price', kept.price,
          'location', kept.location,
          'module', kept.module,
          'category', kept.category,
          'status', kept.status,
          'visibility', kept.visibility,
          'metadata', kept.metadata,
          'created_at', kept.created_at,
          'votos', kept.votos,
          'highlight_score', kept.highlight_score,
          'bumped_at', kept.bumped_at,
          'effective_at', kept.effective_at,
          'last_comment_at', kept.last_comment_at,
          'profiles', kept.profile_payload,
          'post_media', kept.media_payload,
          'comments', jsonb_build_array(jsonb_build_object('count', kept.comment_count))
        )
        order by
          case when v_sort = 'votos' then kept.highlight_score end desc nulls last,
          case when v_sort = 'votos' then kept.votos end desc nulls last,
          case when v_sort = 'comentados' then kept.last_comment_at end desc nulls last,
          case when v_sort = 'recentes' then kept.effective_at end desc nulls last,
          kept.created_at desc,
          kept.id desc
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from limited),
    case
      when (select count(*) > v_limit from limited) then (
        select encode(
          convert_to(
            jsonb_build_object(
              'sort', v_sort,
              'highlight_score', cursor_row.highlight_score,
              'votos', cursor_row.votos,
              'last_comment_at', cursor_row.last_comment_at,
              'effective_at', cursor_row.effective_at,
              'bumped_at', cursor_row.bumped_at,
              'created_at', cursor_row.created_at,
              'id', cursor_row.id
            )::text,
            'utf8'
          ),
          'base64'
        )
        from cursor_row
      )
      else null
    end
    into v_posts, v_has_more, v_next_cursor
  from kept;

  return jsonb_build_object(
    'ok', true,
    'posts', coalesce(v_posts, '[]'::jsonb),
    'hasMore', coalesce(v_has_more, false),
    'has_more', coalesce(v_has_more, false),
    'nextCursor', v_next_cursor,
    'next_cursor', v_next_cursor
  );
end;
$$;

grant execute on function public.kc_get_feed_cursor(text, text[], text, text, text, text, text, int, text, jsonb) to anon, authenticated;

create or replace function public.kc_get_feed_cursor(
  p_module text default null,
  p_modules text[] default null,
  p_category text default null,
  p_subcategory text default null,
  p_tag text default null,
  p_q text default null,
  p_sort_by text default 'recentes',
  p_limit int default 12,
  p_cursor text default null
)
returns jsonb
language sql
set search_path = public
stable
as $$
  select public.kc_get_feed_cursor(
    p_module,
    p_modules,
    p_category,
    p_subcategory,
    p_tag,
    p_q,
    p_sort_by,
    p_limit,
    p_cursor,
    null::jsonb
  );
$$;

grant execute on function public.kc_get_feed_cursor(text, text[], text, text, text, text, text, int, text) to anon, authenticated;

commit;
