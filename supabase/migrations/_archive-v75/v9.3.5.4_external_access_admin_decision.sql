-- Kino Campus -- v9.3.5.4
-- Adiciona campos de decisão admin em help_requests para fluxo de
-- "Solicitar acesso externo" (kc-auth-external-access).
-- RPCs admin para listar e decidir solicitações.

alter table public.help_requests
  add column if not exists admin_status text not null default 'pending'
    check (admin_status in ('pending', 'approved', 'rejected', 'na')),
  add column if not exists admin_decided_at timestamptz null,
  add column if not exists admin_decided_by uuid null references public.profiles(id) on delete set null,
  add column if not exists admin_note text null;

-- Solicitações que NÃO são external_access marcadas como 'na' (não se aplica)
update public.help_requests
set admin_status = 'na'
where type <> 'external_access'
  and coalesce(metadata->>'request_kind', '') <> 'external_access'
  and admin_status = 'pending';

-- Index para queries admin (filtra por status + ordena por criação)
create index if not exists help_requests_admin_status_idx
  on public.help_requests (admin_status, created_at desc)
  where type = 'external_access' or metadata->>'request_kind' = 'external_access';

-- RPC: listar solicitações de acesso externo paginadas (admin-only)
create or replace function public.kc_admin_list_external_access(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  out_id uuid,
  out_created_at timestamptz,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_admin_note text,
  out_subject text,
  out_message text,
  out_contact_email text,
  out_requester_name text,
  out_affiliation_context text,
  out_metadata jsonb,
  out_total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_filter_status text := lower(coalesce(p_status, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total bigint;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select kc_private.kc_is_admin(v_user) into v_is_admin;
  if not v_is_admin then raise exception 'not_authorized'; end if;

  select count(*) into v_total
  from public.help_requests h
  where (h.type = 'external_access' or h.metadata->>'request_kind' = 'external_access')
    and (v_filter_status = '' or v_filter_status = 'all' or h.admin_status = v_filter_status);

  return query
  select
    h.id,
    h.created_at,
    h.admin_status,
    h.admin_decided_at,
    h.admin_note,
    h.subject,
    h.message,
    h.contact_email,
    nullif(h.metadata->>'requester_name', ''),
    nullif(h.metadata->>'affiliation_context', ''),
    h.metadata,
    v_total
  from public.help_requests h
  where (h.type = 'external_access' or h.metadata->>'request_kind' = 'external_access')
    and (v_filter_status = '' or v_filter_status = 'all' or h.admin_status = v_filter_status)
  order by
    case when h.admin_status = 'pending' then 0 else 1 end,
    h.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.kc_admin_list_external_access(text, integer, integer) from public;
grant execute on function public.kc_admin_list_external_access(text, integer, integer) to authenticated;

-- RPC: decidir solicitação (chamada via Edge Function kc-external-access-decide)
create or replace function public.kc_admin_decide_external_access(
  p_id uuid,
  p_decision text,
  p_note text default null
)
returns table (
  out_id uuid,
  out_admin_status text,
  out_admin_decided_at timestamptz,
  out_contact_email text,
  out_requester_name text,
  out_metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_decision text := lower(coalesce(p_decision, ''));
  v_row record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select kc_private.kc_is_admin(v_user) into v_is_admin;
  if not v_is_admin then raise exception 'not_authorized'; end if;
  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  update public.help_requests
  set
    admin_status = v_decision,
    admin_decided_at = now(),
    admin_decided_by = v_user,
    admin_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id
    and (type = 'external_access' or metadata->>'request_kind' = 'external_access')
    and admin_status in ('pending', v_decision)
  returning
    id,
    admin_status,
    admin_decided_at,
    contact_email,
    nullif(metadata->>'requester_name', ''),
    metadata
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

revoke all on function public.kc_admin_decide_external_access(uuid, text, text) from public;
grant execute on function public.kc_admin_decide_external_access(uuid, text, text) to authenticated;

comment on column public.help_requests.admin_status is
  'v9.3.5.4: pending|approved|rejected|na (na = não se aplica)';
comment on function public.kc_admin_list_external_access(text, integer, integer) is
  'v9.3.5.4: lista solicitações de acesso externo paginadas/filtradas por admin_status. Requer admin.';
comment on function public.kc_admin_decide_external_access(uuid, text, text) is
  'v9.3.5.4: marca solicitação como approved ou rejected. Requer admin. Idempotente.';
