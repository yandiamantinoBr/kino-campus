begin;

create or replace function public.kc_admin_search_posts_full(
  p_query text default null,
  p_status text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  legacy_id text,
  title text,
  content text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  author_id uuid,
  author_name text,
  module text,
  category text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
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
    coalesce(p.content, '') as content,
    coalesce(p.status, 'pending') as status,
    p.created_at,
    coalesce(p.updated_at, p.created_at) as updated_at,
    p.author_id,
    coalesce(pr.display_name, pr.full_name, pr.email, 'Usuario') as author_name,
    coalesce(p.module, '') as module,
    coalesce(p.category, '') as category,
    count(*) over() as total_count
  from public.posts as p
  left join public.profiles as pr
    on pr.id = p.author_id
  where
    (v_status is null or p.status = v_status)
    and (
      v_query is null
      or coalesce(p.title, '') ilike '%' || v_query || '%'
      or coalesce(p.content, '') ilike '%' || v_query || '%'
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

revoke all on function public.kc_admin_search_posts_full(text, text, int, int) from public;
grant execute on function public.kc_admin_search_posts_full(text, text, int, int) to authenticated, service_role;

commit;
