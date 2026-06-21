-- v9.3.5.8 - Conserta admin/moderation + endereca warnings do Supabase Linter
--
-- 1. RPC kc_admin_search_posts_full referenciava p.content (coluna renomeada
--    para p.description) e pr.email (nao existe em profiles). Resultado: 42703
--    "column p.content does not exist", admin/moderation.html mostrava
--    "Erro ao listar posts. Verifique policies/admin no Supabase."
--
-- 2. RLS help_requests_insert_anon usava WITH CHECK (true). Trocado por
--    constraints minimas: anon so pode criar com admin_status=pending,
--    status=new, user_id null e priority em (low|normal|high).
--
-- 3. Revoga EXECUTE de anon nas RPCs admin (kc_admin_decide_external_access,
--    kc_admin_list_external_access). Mantem authenticated (Edge Function
--    chama com JWT de admin; check kc_is_admin protege contra abuso).

-- ── 1. RPC kc_admin_search_posts_full ────────────────────────────────────────
create or replace function kc_private.kc_admin_search_posts_full(
  p_query text default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns table (
  id uuid, legacy_id text, title text, content text, status text,
  created_at timestamptz, updated_at timestamptz, author_id uuid,
  author_name text, module text, category text, total_count bigint
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    p.id,
    p.legacy_id,
    coalesce(p.title, 'Post sem titulo') as title,
    coalesce(p.description, '') as content,
    coalesce(p.status, 'pending') as status,
    p.created_at,
    coalesce(p.updated_at, p.created_at) as updated_at,
    p.author_id,
    coalesce(pr.display_name, pr.full_name, 'Usuario') as author_name,
    coalesce(p.module, '') as module,
    coalesce(p.category, '') as category,
    count(*) over() as total_count
  from public.posts as p
  left join public.profiles as pr on pr.id = p.author_id
  where
    (v_status is null or p.status = v_status)
    and (
      v_query is null
      or coalesce(p.title, '') ilike '%' || v_query || '%'
      or coalesce(p.description, '') ilike '%' || v_query || '%'
      or coalesce(p.legacy_id, '') ilike '%' || v_query || '%'
      or p.id::text ilike '%' || v_query || '%'
      or coalesce(pr.display_name, '') ilike '%' || v_query || '%'
      or coalesce(pr.full_name, '') ilike '%' || v_query || '%'
    )
  order by p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

-- ── 2. RLS help_requests_insert_anon menos permissiva ────────────────────────
drop policy if exists help_requests_insert_anon on public.help_requests;
create policy help_requests_insert_anon
  on public.help_requests
  for insert
  to anon
  with check (
    user_id is null
    and coalesce(admin_status, 'pending') = 'pending'
    and coalesce(status, 'new') = 'new'
    and coalesce(priority, 'normal') in ('low', 'normal', 'high')
  );

-- ── 3. Revoga EXECUTE de anon nas RPCs admin ─────────────────────────────────
revoke execute on function public.kc_admin_decide_external_access(uuid, text, text) from anon;
revoke execute on function public.kc_admin_list_external_access(text, integer, integer) from anon;

comment on function kc_private.kc_admin_search_posts_full(text, text, integer, integer) is
  'v9.3.5.8: fixed column reference (description ex-content) + removed pr.email';
comment on policy help_requests_insert_anon on public.help_requests is
  'v9.3.5.8: anon insere apenas com admin_status=pending, status=new, user_id null';
