-- v8.2.10.6
-- RPC auxiliar para resolver título/status/autor de posts em páginas de denúncia
-- mesmo quando SELECT direto em public.posts estiver restrito por RLS.

begin;

create or replace function public.kc_admin_list_posts_by_ids(
  p_ids uuid[]
)
returns table (
  id uuid,
  title text,
  status text,
  author_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;

  return query
  select p.id,
         coalesce(p.title, p.titulo, 'Post sem título') as title,
         coalesce(p.status, 'indisponível') as status,
         p.author_id
  from public.posts p
  where p.id = any (p_ids);
end;
$$;

revoke all on function public.kc_admin_list_posts_by_ids(uuid[]) from public;
grant execute on function public.kc_admin_list_posts_by_ids(uuid[]) to authenticated, service_role;

commit;
