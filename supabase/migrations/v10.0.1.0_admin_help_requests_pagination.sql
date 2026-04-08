begin;

create or replace function public.kc_admin_list_help_requests_paged(
  p_status text default null,
  p_type text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  topic text,
  subtopic text,
  subject text,
  message text,
  priority text,
  status text,
  page_path text,
  contact_email text,
  allow_contact boolean,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_type text := nullif(trim(coalesce(p_type, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null or not public.kc_is_admin(v_uid) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    hr.id,
    hr.user_id,
    hr.type,
    hr.topic,
    hr.subtopic,
    hr.subject,
    hr.message,
    hr.priority,
    hr.status,
    hr.page_path,
    hr.contact_email,
    hr.allow_contact,
    hr.metadata,
    hr.created_at,
    hr.updated_at,
    coalesce(pr.display_name, pr.full_name, pr.email, 'Usuario') as author_name,
    count(*) over() as total_count
  from public.help_requests as hr
  left join public.profiles as pr
    on pr.id = hr.user_id
  where
    (v_status is null or hr.status = v_status)
    and (v_type is null or hr.type = v_type)
  order by hr.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.kc_admin_list_help_requests_paged(text, text, int, int) from public;
grant execute on function public.kc_admin_list_help_requests_paged(text, text, int, int) to authenticated, service_role;

commit;
