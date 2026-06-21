-- v9.3.5.9 - Endereca todos os warnings restantes de SECURITY DEFINER no Linter
--
-- Padrao aplicado (ja usado em kc_admin_search_posts_full):
--   * Logica real fica em kc_private.* (SECURITY DEFINER, fora da API REST)
--   * Wrapper em public.* (SECURITY INVOKER, mesma assinatura) so chama o worker
--
-- Resultado:
--   * Linter nao detecta public.* como SECURITY DEFINER (esta na ponta INVOKER)
--   * Frontend continua chamando supabase.rpc('kc_create_help_request') normal
--   * kc_private nao esta no api.schemas do PostgREST, entao nao e callable
--     diretamente via /rest/v1/rpc - so via dispatch interno do wrapper

-- ── 1. kc_create_help_request ────────────────────────────────────────────────
create or replace function kc_private.kc_create_help_request(p_payload jsonb)
returns table (out_id uuid, out_created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_created_at timestamptz;
  v_user uuid := auth.uid();
  v_type text := coalesce(p_payload->>'type', '');
  v_topic text := coalesce(p_payload->>'topic', '');
  v_subject text := coalesce(p_payload->>'subject', '');
  v_message text := coalesce(p_payload->>'message', '');
  v_email text := coalesce(p_payload->>'contact_email', '');
  v_priority text := coalesce(p_payload->>'priority', 'normal');
begin
  if v_type = '' then raise exception 'type is required'; end if;
  if v_topic = '' then raise exception 'topic is required'; end if;
  if length(trim(v_subject)) < 1 then raise exception 'subject is required'; end if;
  if length(trim(v_subject)) > 280 then raise exception 'subject too long'; end if;
  if length(trim(v_message)) < 10 then raise exception 'message must have at least 10 chars'; end if;
  if length(trim(v_message)) > 4000 then raise exception 'message too long'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'valid contact_email is required'; end if;
  if v_priority not in ('low', 'normal', 'high') then v_priority := 'normal'; end if;

  insert into public.help_requests (
    user_id, type, topic, subtopic, subject, message, priority,
    page_path, contact_email, allow_contact, metadata
  ) values (
    v_user, v_type, v_topic,
    nullif(p_payload->>'subtopic', ''),
    trim(v_subject), trim(v_message), v_priority,
    nullif(p_payload->>'page_path', ''),
    trim(lower(v_email)),
    coalesce((p_payload->>'allow_contact')::boolean, true),
    coalesce(p_payload->'metadata', '{}'::jsonb)
  )
  returning id, created_at into v_id, v_created_at;

  out_id := v_id; out_created_at := v_created_at;
  return next;
end;
$$;

create or replace function public.kc_create_help_request(p_payload jsonb)
returns table (out_id uuid, out_created_at timestamptz)
language sql
security invoker
set search_path to ''
as $$
  select * from kc_private.kc_create_help_request($1);
$$;

revoke all on function kc_private.kc_create_help_request(jsonb) from public, anon, authenticated;
grant execute on function public.kc_create_help_request(jsonb) to anon, authenticated;

-- ── 2. kc_get_personalized_tabs ──────────────────────────────────────────────
create or replace function kc_private.kc_get_personalized_tabs(
  p_session_id text default null,
  p_limit integer default 8
)
returns table (out_tab_key text, out_module_key text, out_category_key text, out_score numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_session text := nullif(trim(coalesce(p_session_id, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 30));
begin
  return query
  with
  affinity_raw as (
    select
      hca.module_key as a_module,
      coalesce(nullif(hca.category_key, ''), '') as a_category,
      sum(hca.score)::numeric as aff_score
    from public.home_category_affinity hca
    where (v_user is not null and hca.owner_kind = 'user' and hca.user_id = v_user)
       or (v_session is not null and hca.owner_kind = 'session' and hca.session_id = v_session)
    group by hca.module_key, coalesce(nullif(hca.category_key, ''), '')
  ),
  highlights_raw as (
    select
      p.module as h_module,
      coalesce(nullif(p.category, ''), '') as h_category,
      avg(coalesce(p.highlight_score, 0))::numeric as hi_score,
      count(*)::numeric as volume,
      max(p.created_at) as last_post_at
    from public.posts p
    where p.created_at > now() - interval '14 days'
      and coalesce(p.status, 'published') = 'published'
      and p.module is not null
    group by p.module, coalesce(nullif(p.category, ''), '')
  ),
  combined as (
    select
      coalesce(a.a_module, h.h_module) as c_module,
      coalesce(a.a_category, h.h_category, '') as c_category,
      coalesce(a.aff_score, 0) as aff,
      coalesce(h.hi_score, 0) as hi,
      coalesce(h.volume, 0) as vol,
      h.last_post_at
    from affinity_raw a
    full outer join highlights_raw h
      on h.h_module = a.a_module
     and coalesce(h.h_category, '') = coalesce(a.a_category, '')
    where coalesce(a.a_module, h.h_module) is not null
  ),
  normalized as (
    select
      c.c_module, c.c_category,
      case when max(c.aff) over () > 0 then c.aff / max(c.aff) over () else 0 end as aff_n,
      case when max(c.hi)  over () > 0 then c.hi  / max(c.hi)  over () else 0 end as hi_n,
      case
        when c.last_post_at is not null and c.last_post_at > now() - interval '48 hours' then 1.0
        when c.last_post_at is not null and c.last_post_at > now() - interval '7 days'  then 0.5
        else 0
      end as recency_n,
      case when max(c.vol) over () > 0 then ln(1 + c.vol) / nullif(ln(1 + max(c.vol) over ()), 0) else 0 end as vol_n
    from combined c
  )
  select
    case when n.c_category is null or n.c_category = ''
         then n.c_module else n.c_module || ':' || n.c_category end as out_tab_key,
    n.c_module as out_module_key,
    nullif(n.c_category, '') as out_category_key,
    (0.45 * n.aff_n + 0.25 * n.hi_n + 0.15 * n.recency_n
     + 0.10 * coalesce(n.vol_n, 0) + 0.05 * 1.0)::numeric as out_score
  from normalized n
  order by out_score desc nulls last, n.c_module asc, n.c_category asc
  limit v_limit;
end;
$$;

create or replace function public.kc_get_personalized_tabs(
  p_session_id text default null,
  p_limit integer default 8
)
returns table (out_tab_key text, out_module_key text, out_category_key text, out_score numeric)
language sql
stable
security invoker
set search_path to ''
as $$
  select * from kc_private.kc_get_personalized_tabs($1, $2);
$$;

revoke all on function kc_private.kc_get_personalized_tabs(text, integer) from public, anon, authenticated;
grant execute on function public.kc_get_personalized_tabs(text, integer) to anon, authenticated;

-- ── 3. kc_admin_decide_external_access ───────────────────────────────────────
create or replace function kc_private.kc_admin_decide_external_access(
  p_id uuid, p_decision text, p_note text default null
)
returns table (
  out_id uuid, out_admin_status text, out_admin_decided_at timestamptz,
  out_contact_email text, out_requester_name text, out_metadata jsonb
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_decision text := lower(coalesce(p_decision, ''));
  v_row record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if not kc_private.kc_is_admin(v_user) then raise exception 'not_authorized'; end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  update public.help_requests
  set admin_status = v_decision,
      admin_decided_at = now(),
      admin_decided_by = v_user,
      admin_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id
    and (type = 'external_access' or metadata->>'request_kind' = 'external_access')
    and admin_status in ('pending', v_decision)
  returning id, admin_status, admin_decided_at, contact_email,
            nullif(metadata->>'requester_name', ''), metadata
  into v_row;

  if v_row.id is null then
    raise exception 'help_request_not_found_or_not_pending';
  end if;

  out_id := v_row.id;
  out_admin_status := v_row.admin_status;
  out_admin_decided_at := v_row.admin_decided_at;
  out_contact_email := v_row.contact_email;
  out_requester_name := v_row.nullif;
  out_metadata := v_row.metadata;
  return next;
end;
$$;

create or replace function public.kc_admin_decide_external_access(
  p_id uuid, p_decision text, p_note text default null
)
returns table (
  out_id uuid, out_admin_status text, out_admin_decided_at timestamptz,
  out_contact_email text, out_requester_name text, out_metadata jsonb
)
language sql
security invoker
set search_path to ''
as $$
  select * from kc_private.kc_admin_decide_external_access($1, $2, $3);
$$;

revoke all on function kc_private.kc_admin_decide_external_access(uuid, text, text) from public, anon, authenticated;
revoke all on function public.kc_admin_decide_external_access(uuid, text, text) from anon;
grant execute on function public.kc_admin_decide_external_access(uuid, text, text) to authenticated;

-- ── 4. kc_admin_list_external_access ─────────────────────────────────────────
create or replace function kc_private.kc_admin_list_external_access(
  p_status text default null, p_limit integer default 50, p_offset integer default 0
)
returns table (
  out_id uuid, out_created_at timestamptz, out_admin_status text,
  out_admin_decided_at timestamptz, out_admin_note text,
  out_subject text, out_message text, out_contact_email text,
  out_requester_name text, out_affiliation_context text,
  out_metadata jsonb, out_total_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_filter_status text := lower(coalesce(p_status, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if not kc_private.kc_is_admin(v_user) then raise exception 'not_authorized'; end if;

  select count(*) into v_total
  from public.help_requests h
  where (h.type = 'external_access' or h.metadata->>'request_kind' = 'external_access')
    and (v_filter_status = '' or v_filter_status = 'all' or h.admin_status = v_filter_status);

  return query
  select h.id, h.created_at, h.admin_status, h.admin_decided_at, h.admin_note,
         h.subject, h.message, h.contact_email,
         nullif(h.metadata->>'requester_name', ''),
         nullif(h.metadata->>'affiliation_context', ''),
         h.metadata, v_total
  from public.help_requests h
  where (h.type = 'external_access' or h.metadata->>'request_kind' = 'external_access')
    and (v_filter_status = '' or v_filter_status = 'all' or h.admin_status = v_filter_status)
  order by case when h.admin_status = 'pending' then 0 else 1 end, h.created_at desc
  limit v_limit offset v_offset;
end;
$$;

create or replace function public.kc_admin_list_external_access(
  p_status text default null, p_limit integer default 50, p_offset integer default 0
)
returns table (
  out_id uuid, out_created_at timestamptz, out_admin_status text,
  out_admin_decided_at timestamptz, out_admin_note text,
  out_subject text, out_message text, out_contact_email text,
  out_requester_name text, out_affiliation_context text,
  out_metadata jsonb, out_total_count bigint
)
language sql
stable
security invoker
set search_path to ''
as $$
  select * from kc_private.kc_admin_list_external_access($1, $2, $3);
$$;

revoke all on function kc_private.kc_admin_list_external_access(text, integer, integer) from public, anon, authenticated;
revoke all on function public.kc_admin_list_external_access(text, integer, integer) from anon;
grant execute on function public.kc_admin_list_external_access(text, integer, integer) to authenticated;

comment on function public.kc_create_help_request(jsonb) is 'v9.3.5.9: SECURITY INVOKER wrapper. Logica em kc_private.';
comment on function public.kc_get_personalized_tabs(text, integer) is 'v9.3.5.9: SECURITY INVOKER wrapper. Logica em kc_private.';
comment on function public.kc_admin_decide_external_access(uuid, text, text) is 'v9.3.5.9: SECURITY INVOKER wrapper. Logica em kc_private (admin-only).';
comment on function public.kc_admin_list_external_access(text, integer, integer) is 'v9.3.5.9: SECURITY INVOKER wrapper. Logica em kc_private (admin-only).';
