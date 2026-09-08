-- Explicit removal of proven byte-identical associations. Never accepts a post patch.
-- Deploy before enabling the matching Edge action. Existing integrity RPC is unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.kc_cadu_select_post_media(
  p_post_id uuid, p_actor_id uuid, p_request jsonb, p_verified_pairs jsonb
) returns jsonb language plpgsql security invoker
set search_path=''
set lock_timeout='5s'
set statement_timeout='15s'
as $$
declare
  v_post public.posts%rowtype;
  v_full_before jsonb;
  v_full_after jsonb;
  v_actual jsonb;
  v_expected jsonb;
  v_before jsonb;
  v_after jsonb;
  v_media jsonb;
  v_expected_media jsonb;
  v_after_media jsonb;
  v_fresh_media jsonb;
  v_meta jsonb;
  v_history jsonb;
  v_last jsonb;
  v_entry jsonb;
  v_pair jsonb;
  v_remove public.post_media%rowtype;
  v_keep public.post_media%rowtype;
  v_remove_ids uuid[]='{}';
  v_remove_urls text[]='{}';
  v_cover text;
  v_render text;
  v_key text;
  v_request_hash text;
  v_audit_id uuid;
  v_audit_payload jsonb;
  v_operation text;
  v_keys text[]=array['id','author_id','created_at','title','description','price','location','module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
  v_gallery_keys text[]=array['gallery_image_urls','galleryImageUrls','image_urls','imageUrls'];
begin
  if current_user<>'service_role' or p_actor_id is distinct from '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid
    or not exists(select 1 from public.kc_trusted_publishers where user_id=p_actor_id) then
    raise exception 'canonical trusted service publisher required' using errcode='42501';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>524288
    or (select count(*) from jsonb_object_keys(p_request))<>7
    or not(p_request ?& array['contract','operation','operationId','expected','expectedRows','reason'])
    or p_request->>'contract' is distinct from 'cadu-edit-media-selection-v1'
    or coalesce(p_request->>'operation','') not in ('deduplicate','rollback')
    or coalesce(p_request->>'operationId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_request->'reason') is distinct from 'string'
    or length(btrim(p_request->>'reason')) not between 12 and 1000
    or p_request->>'reason' ~ '[[:cntrl:]]' then
    raise exception 'invalid media request' using errcode='22023';
  end if;
  v_operation=p_request->>'operation';
  if (v_operation='deduplicate' and not(p_request ? 'pairs'))
    or (v_operation='rollback' and (not(p_request ? 'rollbackOf') or
      coalesce(p_request->>'rollbackOf','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) then
    raise exception 'wrong operation shape' using errcode='22023';
  end if;
  if jsonb_typeof(p_request->'expected') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_request->'expected'))<>15
    or not((p_request->'expected') ?& v_keys)
    or jsonb_typeof(p_request->'expectedRows') is distinct from 'array'
    or jsonb_array_length(p_request->'expectedRows') not between 1 and 24
    or exists(select 1 from jsonb_array_elements(p_request->'expectedRows') r
      where jsonb_typeof(r)<>'object' or (select count(*) from jsonb_object_keys(r))<>6
       or not(r ?& array['id','post_id','url','is_cover','sort_order','created_at'])
       or jsonb_typeof(r->'is_cover') is distinct from 'boolean'
       or jsonb_typeof(r->'sort_order') is distinct from 'number'
       or jsonb_typeof(r->'created_at') is distinct from 'string') then
    raise exception 'complete post and media snapshots required' using errcode='22023';
  end if;
  select * into v_post from public.posts where id=p_post_id for update;
  if not found or v_post.author_id is distinct from p_actor_id then
    raise exception 'owned post required' using errcode='42501';
  end if;
  if v_post.status not in ('published','closed') or v_post.module not in ('eventos','oportunidades')
    or jsonb_typeof(v_post.metadata->'source_id') is distinct from 'string'
    or jsonb_typeof(v_post.metadata->'source_url') is distinct from 'string'
    or nullif(btrim(v_post.metadata->>'source_id'),'') is null
    or coalesce(v_post.metadata->>'source_url','') !~ '^https://'
    or nullif(v_post.metadata->>'merged_into_post_id','') is not null
    or nullif(v_post.metadata->>'dedup_hidden_keep_id','') is not null
    or exists(select 1 from unnest(array['manual_edits_lock','manual_description']) k where v_post.metadata->>k='true') then
    raise exception 'identity moderation or manual lock prevents media repair' using errcode='22023';
  end if;
  -- Same lock order as append and integrity RPCs. FK child inserts serialize here.
  perform 1 from public.post_media where post_id=p_post_id order by id for update;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.id),'[]'::jsonb) into v_media
    from public.post_media m where post_id=p_post_id;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.id),'[]'::jsonb) into v_expected_media
    from jsonb_populate_recordset(null::public.post_media,p_request->'expectedRows') m;
  v_full_before=to_jsonb(v_post);
  select jsonb_object_agg(key,value) into v_actual from jsonb_each(v_full_before) where key=any(v_keys);
  v_before=(v_actual-'updated_at') || jsonb_build_object('metadata',v_post.metadata-'cadu_media_selection_history');
  v_history=coalesce(v_post.metadata->'cadu_media_selection_history','[]'::jsonb);
  if jsonb_typeof(v_history)<>'array' or jsonb_array_length(v_history)>12
    or exists(select 1 from jsonb_array_elements(v_history) e where jsonb_typeof(e)<>'object') then
    raise exception 'invalid media history' using errcode='22023';
  end if;
  v_last=v_history->-1;
  v_request_hash=encode(extensions.digest(convert_to(p_request::text,'UTF8'),'sha256'),'hex');
  -- A repeated identical operation is a read-only receipt lookup, not another write.
  if exists(select 1 from jsonb_array_elements(v_history) e where e->>'operation_id'=p_request->>'operationId') then
    if v_last->>'operation_id' is distinct from p_request->>'operationId'
      or v_last->>'request_hash' is distinct from v_request_hash
      or v_last->'after' is distinct from v_before or v_last->'media_after' is distinct from v_media
      or not exists(select 1 from public.audit_log a where a.id=(v_last->>'audit_id')::uuid
        and a.actor_id=p_actor_id and a.entity_id=p_post_id and a.action='cadu_post_media_selected'
        and a.payload->>'request_hash'=v_request_hash
        and a.payload->>'entry_hash'=encode(extensions.digest(convert_to(v_last::text,'UTF8'),'sha256'),'hex')) then
      return jsonb_build_object('ok',false,'code','MEDIA_REPLAY_CONFLICT');
    end if;
    return jsonb_build_object('ok',true,'replayed',true,'post',v_actual,'post_media',v_media,'entry',v_last);
  end if;
  v_expected=(p_request->'expected') || jsonb_build_object(
    'created_at',(p_request#>>'{expected,created_at}')::timestamptz,
    'updated_at',(p_request#>>'{expected,updated_at}')::timestamptz,
    'expires_at',(p_request#>>'{expected,expires_at}')::timestamptz);
  if v_actual is distinct from v_expected or v_media is distinct from v_expected_media then
    return jsonb_build_object('ok',false,'code','EDIT_CONFLICT');
  end if;
  if jsonb_array_length(v_history)>=12 or jsonb_array_length(v_media) not between 1 and 24
    or (select count(*) from jsonb_populate_recordset(null::public.post_media,v_media) m where m.is_cover)<>1 then
    raise exception 'bounded gallery and history required' using errcode='22023';
  end if;
  select m.url into v_cover from jsonb_populate_recordset(null::public.post_media,v_media) m where m.is_cover;
  if v_post.image_url is distinct from v_cover
    or exists(select 1 from unnest(array['image_url','cover_url','imageUrl','coverUrl']) k
      where v_post.metadata ? k and v_post.metadata->>k is distinct from v_cover) then
    raise exception 'cover alias conflict requires separate repair' using errcode='22023';
  end if;
  if v_post.metadata ? 'cover_render' then
    v_render=v_post.metadata->>'cover_render';
    if v_render is distinct from v_cover and
      replace(split_part(v_render,'?',1),'/storage/v1/render/image/public/','/storage/v1/object/public/') is distinct from v_cover then
      raise exception 'cover render conflict requires separate repair' using errcode='22023';
    end if;
  end if;
  v_meta=v_post.metadata;
  if v_operation='deduplicate' then
    if jsonb_typeof(p_request->'pairs') is distinct from 'array' or jsonb_array_length(p_request->'pairs') not between 1 and 3
      or jsonb_typeof(p_verified_pairs) is distinct from 'array'
      or jsonb_array_length(p_verified_pairs)<>jsonb_array_length(p_request->'pairs') then
      raise exception 'complete verified byte evidence required' using errcode='22023';
    end if;
    for v_pair in select value from jsonb_array_elements(p_request->'pairs') loop
      if jsonb_typeof(v_pair)<>'object' or (select count(*) from jsonb_object_keys(v_pair))<>3
        or not(v_pair ?& array['removeId','keepId','sha256'])
        or coalesce(v_pair->>'sha256','') !~ '^[a-f0-9]{64}$'
        or v_pair->>'removeId'=v_pair->>'keepId'
        or (v_pair->>'removeId')::uuid=any(v_remove_ids)
        or not exists(select 1 from jsonb_array_elements(p_verified_pairs) e
          where jsonb_typeof(e)='object' and (select count(*) from jsonb_object_keys(e))=4
            and e ?& array['removeId','keepId','sha256','bytes']
            and e-'bytes'=v_pair and jsonb_typeof(e->'bytes')='number'
            and (e->>'bytes')::numeric between 1 and 4194304
            and (e->>'bytes')::numeric=trunc((e->>'bytes')::numeric)) then
        raise exception 'full SHA256 pair evidence mismatch' using errcode='22023';
      end if;
      select * into v_remove from public.post_media where post_id=p_post_id and id=(v_pair->>'removeId')::uuid;
      if not found or v_remove.is_cover then raise exception 'cannot remove cover or foreign media' using errcode='22023'; end if;
      select * into v_keep from public.post_media where post_id=p_post_id and id=(v_pair->>'keepId')::uuid;
      if not found then raise exception 'retained proof media absent' using errcode='22023'; end if;
      v_remove_ids=array_append(v_remove_ids,v_remove.id);
      v_remove_urls=array_append(v_remove_urls,v_remove.url);
    end loop;
    if exists(select 1 from jsonb_array_elements(p_request->'pairs') e where (e->>'keepId')::uuid=any(v_remove_ids)) then
      raise exception 'chained removal forbidden' using errcode='22023';
    end if;
    select jsonb_agg(to_jsonb(m) order by m.sort_order,m.id) into v_after_media
      from public.post_media m where post_id=p_post_id and not(m.id=any(v_remove_ids));
    foreach v_key in array v_gallery_keys loop
      if v_meta ? v_key then
        if jsonb_typeof(v_meta->v_key)<>'array' or exists(select 1 from jsonb_array_elements(v_meta->v_key) e
          where jsonb_typeof(e)<>'string' or not exists(select 1 from public.post_media m where m.post_id=p_post_id and m.url=e#>>'{}')) then
          raise exception 'gallery alias outside exact snapshot' using errcode='22023';
        end if;
        v_meta=jsonb_set(v_meta,array[v_key],coalesce((select jsonb_agg(e order by ord)
          from jsonb_array_elements(v_meta->v_key) with ordinality x(e,ord)
          where not((e#>>'{}')=any(v_remove_urls))),'[]'::jsonb));
      end if;
    end loop;
    if v_meta ? 'gallery_count' then
      if v_meta->'gallery_count' is distinct from to_jsonb(jsonb_array_length(v_media)) then
        raise exception 'gallery count conflict' using errcode='22023';
      end if;
      v_meta=jsonb_set(v_meta,'{gallery_count}',to_jsonb(jsonb_array_length(v_after_media)));
    end if;
  else
    if p_verified_pairs is distinct from '[]'::jsonb or v_last->>'contract' is distinct from 'cadu-edit-media-selection-v1'
      or v_last->>'operation' is distinct from 'deduplicate' or v_last->>'operation_id' is distinct from p_request->>'rollbackOf'
      or v_last->'after' is distinct from v_before or v_last->'media_after' is distinct from v_media
      or v_last->>'before_hash' is distinct from encode(extensions.digest(convert_to((v_last->'before')::text,'UTF8'),'sha256'),'hex')
      or not exists(select 1 from public.audit_log a where a.id=(v_last->>'audit_id')::uuid and a.actor_id=p_actor_id
        and a.entity_id=p_post_id and a.action='cadu_post_media_selected'
        and a.payload->>'entry_hash'=encode(extensions.digest(convert_to(v_last::text,'UTF8'),'sha256'),'hex')) then
      return jsonb_build_object('ok',false,'code','EDIT_CONFLICT');
    end if;
    v_meta=v_last#>'{before,metadata}';
    v_after_media=v_last->'media_before';
  end if;
  -- Derived state may differ only in gallery arrays/count and this operation's history.
  if (v_meta-v_gallery_keys-'gallery_count'-'cadu_media_selection_history') is distinct from
    (v_post.metadata-v_gallery_keys-'gallery_count'-'cadu_media_selection_history') then
    raise exception 'non-media metadata changed' using errcode='22023';
  end if;
  v_after=(v_actual-'updated_at') || jsonb_build_object('metadata',v_meta-'cadu_media_selection_history');
  v_audit_id=gen_random_uuid();
  v_entry=jsonb_build_object('contract','cadu-edit-media-selection-v1','operation',v_operation,
    'operation_id',p_request->>'operationId','request_hash',v_request_hash,'at',clock_timestamp(),
    'audit_id',v_audit_id,'reason',p_request->>'reason','before',v_before,'after',v_after,
    'before_hash',encode(extensions.digest(convert_to(v_before::text,'UTF8'),'sha256'),'hex'),
    'after_hash',encode(extensions.digest(convert_to(v_after::text,'UTF8'),'sha256'),'hex'),
    'media_before',v_media,'media_after',v_after_media,'verified_pairs',p_verified_pairs)
    || case when v_operation='rollback' then jsonb_build_object('rollback_of',p_request->>'rollbackOf') else '{}'::jsonb end;
  v_meta=jsonb_set(v_meta,'{cadu_media_selection_history}',v_history || jsonb_build_array(v_entry));
  if octet_length(v_meta::text)>1048576 then raise exception 'history too large' using errcode='22023'; end if;
  if v_operation='deduplicate' then
    delete from public.post_media where post_id=p_post_id and id=any(v_remove_ids);
  else
    -- Restore only the removed rows. A reused UUID or changed retained row is a conflict.
    insert into public.post_media(id,post_id,url,is_cover,sort_order,created_at)
      select m.id,m.post_id,m.url,m.is_cover,m.sort_order,m.created_at
      from jsonb_populate_recordset(null::public.post_media,v_after_media) m
      where not exists(select 1 from public.post_media a where a.id=m.id);
  end if;
  update public.posts set metadata=v_meta where id=p_post_id;
  v_audit_payload=jsonb_build_object('contract','cadu-edit-media-selection-v1','operation_id',p_request->>'operationId',
    'operation',v_operation,'request_hash',v_request_hash,'before_hash',v_entry->>'before_hash','after_hash',v_entry->>'after_hash',
    'entry_hash',encode(extensions.digest(convert_to(v_entry::text,'UTF8'),'sha256'),'hex'));
  insert into public.audit_log(id,actor_id,action,entity_type,entity_id,payload)
    values(v_audit_id,p_actor_id,'cadu_post_media_selected','post',p_post_id,v_audit_payload);
  -- Reread AFTER all post/media/audit triggers. UPDATE RETURNING is not a final receipt.
  select to_jsonb(p) into v_full_after from public.posts p where id=p_post_id;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.sort_order,m.id),'[]'::jsonb) into v_fresh_media
    from public.post_media m where post_id=p_post_id;
  if (v_full_after-'updated_at') is distinct from ((v_full_before-'updated_at') || jsonb_build_object('metadata',v_meta))
    or v_fresh_media is distinct from v_after_media
    or not exists(select 1 from public.audit_log a where a.id=v_audit_id and a.actor_id=p_actor_id and a.entity_id=p_post_id
      and a.action='cadu_post_media_selected' and a.payload=v_audit_payload) then
    raise exception 'final state drift after media/audit triggers; transaction rolled back' using errcode='23514';
  end if;
  select jsonb_object_agg(key,value) into v_actual from jsonb_each(v_full_after) where key=any(v_keys);
  return jsonb_build_object('ok',true,'replayed',false,'post',v_actual,'post_media',v_fresh_media,'entry',v_entry);
end;
$$;
revoke all on function public.kc_cadu_select_post_media(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kc_cadu_select_post_media(uuid,uuid,jsonb,jsonb) to service_role;
comment on function public.kc_cadu_select_post_media(uuid,uuid,jsonb,jsonb) is
 'Canonical service Cadu only: exact 15+6 CAS, Edge-verified full SHA duplicate pairs, server-derived gallery changes, immutable facts/cover/order, atomic history, idempotent receipt and rollback.';
commit;
