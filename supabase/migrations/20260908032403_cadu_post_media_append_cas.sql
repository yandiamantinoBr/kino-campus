-- Serialize conservative client deduplication against a complete media snapshot.
-- Deploy the RPC before the append client. No existing row or uniqueness key changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.kc_cadu_append_post_media(
  p_post_id uuid, p_expected_rows jsonb, p_append_urls text[]
) returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_author uuid;
  v_actual jsonb;
  v_expected jsonb;
  v_inserted jsonb;
  v_next_order integer;
  v_keys text[] := array['id','post_id','url','is_cover','sort_order','created_at'];
begin
  -- Supabase verifies the JWT; also require exact Cadu actor, an active session
  -- and ownership. Invoker preserves existing RLS, including session revocation.
  if current_user <> 'authenticated'
    or auth.uid() is distinct from '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid
    or public.kc_is_current_session_active() is distinct from true then
    raise exception 'active canonical publisher required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_expected_rows) is distinct from 'array'
    or jsonb_array_length(p_expected_rows) > 24 or octet_length(p_expected_rows::text) > 262144
    or cardinality(p_append_urls) is null or cardinality(p_append_urls) not between 1 and 5
    or array_ndims(p_append_urls) <> 1
    or exists (select 1 from unnest(p_append_urls) as u
      where u is null or length(u) > 8192 or u !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' or u <> btrim(u))
    or (select count(distinct u) from unnest(p_append_urls) as u) <> cardinality(p_append_urls)
    or exists (select 1 from jsonb_array_elements(p_expected_rows) as r
      where jsonb_typeof(r) <> 'object' or (select count(*) from jsonb_object_keys(r)) <> 6
        or not (r ?& v_keys) or jsonb_typeof(r->'id') <> 'string'
        or r->>'post_id' is distinct from p_post_id::text
        or jsonb_typeof(r->'url') <> 'string' or length(r->>'url') not between 1 and 8192
        or jsonb_typeof(r->'is_cover') <> 'boolean'
        or jsonb_typeof(r->'sort_order') not in ('number','null')
        or jsonb_typeof(r->'created_at') not in ('string','null')) then
    raise exception 'invalid append snapshot or URLs' using errcode = '22023';
  end if;
  -- Same parent-before-media lock order as the canonical integrity repair RPC.
  -- The FK also makes concurrent child inserts wait for this parent lock.
  select author_id into v_author from public.posts where id = p_post_id for update;
  if not found or v_author is distinct from auth.uid() then
    raise exception 'owned post required' using errcode = '42501';
  end if;
  perform 1 from public.post_media where post_id = p_post_id order by id for update;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into v_actual
    from (select id,post_id,url,is_cover,sort_order,created_at from public.post_media where post_id = p_post_id) as r;
  -- Timestamp casts preserve all six microseconds; clients send the raw value.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',(r->>'id')::uuid,'post_id',(r->>'post_id')::uuid,'url',r->>'url',
    'is_cover',(r->>'is_cover')::boolean,'sort_order',(r->>'sort_order')::integer,
    'created_at',(r->>'created_at')::timestamptz
  ) order by (r->>'id')::uuid),'[]'::jsonb) into v_expected from jsonb_array_elements(p_expected_rows) as r;
  if v_actual is distinct from v_expected then
    return jsonb_build_object('ok',false,'code','MEDIA_EDIT_CONFLICT');
  end if;
  if jsonb_array_length(v_actual) + cardinality(p_append_urls) > 24 then
    raise exception 'media cap exceeded' using errcode = '22023';
  end if;
  select coalesce(max(sort_order),-1) + 1 into v_next_order from public.post_media where post_id = p_post_id;
  if v_next_order < 0 or v_next_order > 1000000 - cardinality(p_append_urls) then
    raise exception 'invalid media order' using errcode = '22023';
  end if;
  with inserted as (
    insert into public.post_media (post_id,url,is_cover,sort_order)
      select p_post_id,u,false,v_next_order + ordinality::integer - 1
      from unnest(p_append_urls) with ordinality as urls(u,ordinality)
      on conflict (post_id,url) do nothing
      returning id,post_id,url,is_cover,sort_order,created_at
  ) select coalesce(jsonb_agg(to_jsonb(inserted) order by sort_order,id),'[]'::jsonb) into v_inserted from inserted;
  return jsonb_build_object('ok',true,'code','MEDIA_APPENDED','post_id',p_post_id,'inserted',v_inserted);
end;
$$;

revoke all on function public.kc_cadu_append_post_media(uuid,jsonb,text[]) from public,anon,authenticated,service_role;
grant execute on function public.kc_cadu_append_post_media(uuid,jsonb,text[]) to authenticated;
comment on function public.kc_cadu_append_post_media(uuid,jsonb,text[]) is
  'Active canonical Cadu owner only; exact media CAS and post lock; append-only; conservative URL identity remains in the caller.';
commit;
