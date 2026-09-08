-- Canonical Cadu repair: complete snapshots travel in the RPC body. Optional
-- media selection changes only audited associations; Storage is never touched.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.kc_cadu_correct_post_integrity(
  p_post_id uuid, p_actor_id uuid, p_expected jsonb, p_update jsonb, p_media jsonb default null
) returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_post public.posts%rowtype;
  v_expected jsonb;
  v_actual jsonb;
  v_history jsonb;
  v_next_history jsonb;
  v_entry jsonb;
  v_media_before jsonb;
  v_media_after jsonb;
  v_media_actual jsonb;
  v_cover text;
  v_keys text[] := array['id','author_id','created_at','title','description','price','location',
    'module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
begin
  if current_user <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.kc_trusted_publishers where user_id = p_actor_id
  ) then raise exception 'trusted publisher required' using errcode = '42501'; end if;
  if jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_update) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_expected)) <> 15
    or not (p_expected ?& v_keys)
    or (select count(*) from jsonb_object_keys(p_update)) <> (case when p_media is null then 8 else 9 end)
    or not (p_update ?& array['title','description','price','location','category','visibility','expires_at','metadata'])
    or (p_media is not null and not (p_update ? 'image_url'))
    or jsonb_typeof(p_update->'metadata') is distinct from 'object'
    or octet_length(p_expected::text) > 1048576 or octet_length(p_update::text) > 1048576 then
    raise exception 'invalid integrity snapshot or patch' using errcode = '22023';
  end if;
  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.author_id is distinct from p_actor_id then
    raise exception 'owned post required' using errcode = '42501';
  end if;
  select jsonb_object_agg(key, value) into v_actual from jsonb_each(to_jsonb(v_post)) where key = any(v_keys);
  -- Timestamps are compared as timestamptz, preserving all six microseconds.
  -- Metadata and every other field are compared as exact JSON values.
  v_expected := p_expected || jsonb_build_object(
    'created_at', (p_expected->>'created_at')::timestamptz,
    'updated_at', (p_expected->>'updated_at')::timestamptz,
    'expires_at', (p_expected->>'expires_at')::timestamptz
  );
  if v_actual is distinct from v_expected then
    return jsonb_build_object('ok', false, 'code', 'EDIT_CONFLICT');
  end if;
  if v_post.status not in ('published','closed') or v_post.module not in ('eventos','oportunidades')
    or nullif(v_post.metadata->>'source_id','') is null or nullif(v_post.metadata->>'source_url','') is null
    or nullif(v_post.metadata->>'merged_into_post_id','') is not null
    or nullif(v_post.metadata->>'dedup_hidden_keep_id','') is not null
    or p_update->'metadata'->'source_id' is distinct from v_post.metadata->'source_id'
    or p_update->'metadata'->'source_url' is distinct from v_post.metadata->'source_url'
    or p_update->>'visibility' is distinct from v_post.visibility
    or (p_media is null and exists (select 1 from unnest(array['image_url','cover_url','gallery_image_urls','gallery_count','cover_render']) as k
      where p_update->'metadata'->k is distinct from v_post.metadata->k)) then
    raise exception 'immutable identity, moderation, visibility or media mismatch' using errcode = '22023';
  end if;
  v_history := coalesce(v_post.metadata->'cadu_integrity_history','[]'::jsonb);
  v_next_history := p_update->'metadata'->'cadu_integrity_history';
  if jsonb_typeof(v_history) <> 'array' or jsonb_typeof(v_next_history) is distinct from 'array'
    or jsonb_array_length(v_next_history) <> jsonb_array_length(v_history) + 1
    or jsonb_array_length(v_next_history) > 12
    or (v_next_history - (jsonb_array_length(v_next_history) - 1)) is distinct from v_history then
    raise exception 'append-only integrity history required' using errcode = '22023';
  end if;
  v_entry := v_next_history->-1;
  if v_entry->>'contract' is distinct from 'cadu-edit-integrity-v1'
    or coalesce(v_entry->>'operation','') not in ('correct','rollback')
    or coalesce(v_entry->>'operation_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(v_entry->>'before_hash','') !~ '^[0-9a-f]{64}$'
    or coalesce(v_entry->>'after_hash','') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(v_entry->'before') is distinct from 'object'
    or jsonb_typeof(v_entry->'evidence') is distinct from 'array'
    or exists (select 1 from jsonb_array_elements(v_history) as e where e->>'operation_id' = v_entry->>'operation_id') then
    raise exception 'invalid or repeated integrity receipt' using errcode = '22023';
  end if;
  if p_media is not null then
    if jsonb_typeof(p_media) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_media)) <> 2
      or not (p_media ?& array['before','after']) or jsonb_typeof(p_media->'before') is distinct from 'array'
      or jsonb_typeof(p_media->'after') is distinct from 'array' or jsonb_array_length(p_media->'before') > 24
      or jsonb_array_length(p_media->'after') not between 1 and 24
      or exists (select 1 from jsonb_array_elements((p_media->'before') || (p_media->'after')) as r
        where jsonb_typeof(r) <> 'object' or (select count(*) from jsonb_object_keys(r)) <> 6
          or not (r ?& array['id','post_id','url','is_cover','sort_order','created_at'])) then
      raise exception 'invalid exact media snapshot' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_media_before
      from jsonb_populate_recordset(null::public.post_media,p_media->'before') as r;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_media_after
      from jsonb_populate_recordset(null::public.post_media,p_media->'after') as r;
    if exists (select 1 from jsonb_populate_recordset(null::public.post_media,v_media_before || v_media_after) r
      where r.post_id is distinct from p_post_id or r.id is null or r.url is null or r.created_at is null
        or r.is_cover is null or r.sort_order is null or r.sort_order not between 0 and 100)
      or (select count(*) from jsonb_populate_recordset(null::public.post_media,v_media_after) r where r.is_cover) <> 1
      or (select count(distinct r.id) from jsonb_populate_recordset(null::public.post_media,v_media_after) r) <> jsonb_array_length(v_media_after)
      or (select count(distinct r.url) from jsonb_populate_recordset(null::public.post_media,v_media_after) r) <> jsonb_array_length(v_media_after) then
      raise exception 'invalid media identity or ordering' using errcode = '22023';
    end if;
    -- Parent row lock also serializes new children through their foreign key;
    -- lock existing rows before comparing the complete gallery snapshot.
    perform 1 from public.post_media where post_id=p_post_id order by id for update;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_media_actual
      from public.post_media r where post_id=p_post_id;
    if v_media_actual is distinct from v_media_before then
      return jsonb_build_object('ok', false, 'code', 'EDIT_CONFLICT');
    end if;
    select r.url into v_cover from jsonb_populate_recordset(null::public.post_media,v_media_after) r where r.is_cover;
    if p_update->>'image_url' is distinct from v_cover or v_entry->'media' is distinct from p_media then
      raise exception 'media cover or audit mismatch' using errcode = '22023';
    end if;
    if v_entry->>'operation'='correct' and exists (
      select 1 from jsonb_populate_recordset(null::public.post_media,v_media_after) a
      where not exists (select 1 from jsonb_populate_recordset(null::public.post_media,v_media_before) b
        where a.id=b.id and a.post_id=b.post_id and a.url=b.url and a.created_at=b.created_at)
    ) then raise exception 'correction may only select existing media identities' using errcode = '22023'; end if;
    if v_entry->>'operation'='rollback' and p_media->'after' is distinct from v_history->-1->'media'->'before' then
      raise exception 'rollback must restore the exact preceding media snapshot' using errcode = '22023';
    end if;
    -- Only associations excluded by the exact snapshot are detached. Storage
    -- is never addressed; the full old IDs/URLs/order/timestamps stay audited.
    delete from public.post_media where post_id=p_post_id and id not in
      (select r.id from jsonb_populate_recordset(null::public.post_media,v_media_after) r);
    if exists (select 1 from public.post_media p join jsonb_populate_recordset(null::public.post_media,v_media_after) r on p.id=r.id
      where p.post_id<>p_post_id or p.url<>r.url or p.created_at<>r.created_at) then
      raise exception 'media identity reused since repair' using errcode = '22023';
    end if;
    insert into public.post_media(id,post_id,url,is_cover,sort_order,created_at)
      select id,post_id,url,is_cover,sort_order,created_at from jsonb_populate_recordset(null::public.post_media,v_media_after)
      on conflict(id) do update set is_cover=excluded.is_cover,sort_order=excluded.sort_order;
  end if;
  update public.posts set
    title = p_update->>'title', description = p_update->>'description', price = (p_update->>'price')::numeric,
    location = p_update->>'location', category = p_update->>'category',
    visibility = p_update->>'visibility', expires_at = (p_update->>'expires_at')::timestamptz,
    metadata = p_update->'metadata', image_url = case when p_media is null then image_url else p_update->>'image_url' end
  where id = p_post_id returning * into v_post;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, payload) values (
    p_actor_id, 'cadu_post_integrity_corrected', 'post', p_post_id,
    jsonb_build_object('contract', 'cadu-edit-integrity-v1', 'operation_id', v_entry->>'operation_id',
      'operation', v_entry->>'operation', 'before_hash', v_entry->>'before_hash', 'after_hash', v_entry->>'after_hash')
  );
  select jsonb_object_agg(key, value) into v_actual from jsonb_each(to_jsonb(v_post)) where key = any(v_keys);
  if p_media is not null then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_media_actual
      from public.post_media r where post_id=p_post_id;
  end if;
  return jsonb_build_object('ok', true, 'code', 'INTEGRITY_APPLIED', 'post', v_actual, 'post_media',v_media_actual);
end;
$$;

revoke all on function public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb) to service_role;
comment on function public.kc_cadu_correct_post_integrity(uuid,uuid,jsonb,jsonb,jsonb) is
  'Service-role-only Cadu body-based complete-snapshot CAS with row lock, immutable source/media and atomic audit.';
commit;
