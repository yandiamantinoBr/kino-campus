-- Recollect only the captured EMC Unity source conflict. No inverse operation,
-- date choice, content editor, source rebind or media mutation is exposed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create or replace function public.kc_cadu_quarantine_source_conflict(p_post_id uuid, p_actor_id uuid, p_request jsonb)
returns jsonb language plpgsql security invoker
set search_path = '' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  v_post public.posts%rowtype;
  v_actual jsonb; v_expected jsonb; v_original_full jsonb;
  v_media jsonb; v_expected_media jsonb;
  v_evidence jsonb; v_history jsonb; v_entry jsonb; v_after_content jsonb;
  v_now timestamptz;
  v_primary constant text := 'https://emc.ufg.br/e/39516-fundamentos-do-unity3d-para-o-desenvolvimento-de-aplicacoes';
  v_revision constant text := '43f388efbf8989f3c9fa67c57c9908a224f2555f3d6caa50ec82e469cc72247a';
  v_run constant text := 'f41b0d5d-b1da-4fad-a902-eb8c7d9877cc';
  v_text_hash constant text := '709f8c4d1403e75b0fcc27afefefeec03a034d1e058b008574984e77b57868f3';
  v_title constant text := 'Fundamentos do Unity3D para o Desenvolvimento de Aplicações';
  v_keys constant text[] := array['id','author_id','created_at','title','description','price','location','module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
begin
  if current_user <> 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  if p_actor_id is null or not exists(select 1 from public.kc_trusted_publishers where user_id=p_actor_id) then
    raise exception 'trusted publisher required' using errcode='42501';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>1048576 then
    raise exception 'invalid quarantine request' using errcode='22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_request))<>5 or not(p_request ?& array['contract','operationId','expected','expectedMedia','evidence'])
    or p_request->>'contract' is distinct from 'cadu-source-conflict-quarantine-v1'
    or jsonb_typeof(p_request->'operationId') is distinct from 'string'
    or (p_request->>'operationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_request->'expected') is distinct from 'object'
    or jsonb_typeof(p_request->'expectedMedia') is distinct from 'array'
    or jsonb_typeof(p_request->'evidence') is distinct from 'object' then
    raise exception 'closed quarantine schema required' using errcode='22023';
  end if;
  v_expected:=p_request->'expected'; v_evidence:=p_request->'evidence';
  if (select count(*) from jsonb_object_keys(v_expected))<>15 or not(v_expected ?& v_keys)
    or (select count(*) from jsonb_object_keys(v_evidence))<>8
    or not(v_evidence ?& array['sourceUrl','sourceId','sourceRevision','sourceRunId','primaryAccess','sourceText','sourceTextSha256','reason'])
    or v_evidence->>'sourceUrl' is distinct from v_primary
    or v_evidence->>'sourceId' is distinct from 'web.ufg.emc:'||v_primary
    or v_evidence->>'sourceRevision' is distinct from v_revision
    or v_evidence->>'sourceRunId' is distinct from v_run
    or v_evidence->>'primaryAccess' is distinct from 'captured_in_all_no_refetch'
    or v_evidence->>'reason' is distinct from 'source_event_schedule_conflict'
    or v_evidence->>'sourceTextSha256' is distinct from v_text_hash
    or jsonb_typeof(v_evidence->'sourceText') is distinct from 'string'
    or length(v_evidence->>'sourceText')>16000
    or encode(sha256(convert_to(v_evidence->>'sourceText','UTF8')),'hex') is distinct from v_text_hash
    or strpos(v_evidence->>'sourceText','08 de Setembro 2026 às 10:30 a 08 de Outubro 2026 às 13:00')=0
    or strpos(v_evidence->>'sourceText','Data: 15 de outubro a 03 de dezembro de 2026')=0
    or jsonb_array_length(p_request->'expectedMedia')>24 then
    raise exception 'exact captured source conflict required' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_request->'expectedMedia') r where jsonb_typeof(r)<>'object') then
    raise exception 'complete media rows required' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_request->'expectedMedia') r where
    (select count(*) from jsonb_object_keys(r))<>6 or not(r ?& array['id','post_id','url','is_cover','sort_order','created_at'])
    or jsonb_typeof(r->'id') is distinct from 'string' or jsonb_typeof(r->'post_id') is distinct from 'string'
    or jsonb_typeof(r->'url') is distinct from 'string' or jsonb_typeof(r->'is_cover') is distinct from 'boolean'
    or jsonb_typeof(r->'sort_order') is distinct from 'number' or jsonb_typeof(r->'created_at') is distinct from 'string'
    or (r->>'sort_order') !~ '^[0-9]+$') then raise exception 'typed media rows required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_expected_media
    from jsonb_populate_recordset(null::public.post_media,p_request->'expectedMedia') r;
  if exists(select 1 from jsonb_populate_recordset(null::public.post_media,v_expected_media) r
    where r.post_id is distinct from p_post_id or r.id is null or r.created_at is null or r.url is null
    or r.is_cover is null or r.sort_order not between 0 and 100)
    or (select count(distinct r.id) from jsonb_populate_recordset(null::public.post_media,v_expected_media) r)<>jsonb_array_length(v_expected_media)
    or (select count(distinct r.url) from jsonb_populate_recordset(null::public.post_media,v_expected_media) r)<>jsonb_array_length(v_expected_media) then
    raise exception 'invalid or repeated media identity' using errcode='22023';
  end if;
  select * into v_post from public.posts where id=p_post_id for update;
  if not found or v_post.author_id is distinct from p_actor_id then raise exception 'owned post required' using errcode='42501'; end if;
  -- Parent lock also serializes FK insertions; all child snapshots are locked
  -- in the canonical order before comparing six columns and taking the clock.
  perform 1 from public.post_media where post_id=p_post_id order by id for update;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_media from public.post_media r where post_id=p_post_id;
  v_now:=clock_timestamp();
  v_history:=coalesce(v_post.metadata->'cadu_source_conflict_quarantine_history','[]'::jsonb);
  if jsonb_typeof(v_history)<>'array' or jsonb_array_length(v_history)>49 then raise exception 'invalid retained history' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_history) r where jsonb_typeof(r) is distinct from 'object') then
    raise exception 'invalid retained history entry' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(v_history) r where r->>'operation_id'=p_request->>'operationId') then
    return jsonb_build_object('ok',false,'code','EDIT_CONFLICT');
  end if;
  v_original_full:=to_jsonb(v_post);
  select jsonb_object_agg(key,value) into v_actual from jsonb_each(v_original_full) where key=any(v_keys);
  v_expected:=v_expected || jsonb_build_object('created_at',(v_expected->>'created_at')::timestamptz,
    'updated_at',(v_expected->>'updated_at')::timestamptz,'expires_at',(v_expected->>'expires_at')::timestamptz);
  if v_actual is distinct from v_expected or v_media is distinct from v_expected_media then
    return jsonb_build_object('ok',false,'code','EDIT_CONFLICT');
  end if;
  if v_post.metadata->>'source_id' is distinct from 'web.ufg.emc:'||v_primary or v_post.metadata->>'source_url' is distinct from v_primary
    or v_post.metadata->>'source_registry_id' is distinct from 'web.ufg.emc' or v_post.metadata->>'source_revision' is distinct from v_revision
    or v_post.metadata->>'cadu_run_id' is distinct from v_run or v_post.metadata->>'source_title' is distinct from v_title
    or v_post.status is distinct from 'published' or v_post.visibility is distinct from 'public' or v_post.module is distinct from 'eventos'
    or nullif(v_post.metadata->>'merged_into_post_id','') is not null or nullif(v_post.metadata->>'dedup_hidden_keep_id','') is not null
    or coalesce(v_post.metadata->>'manual_edits_lock','')='true' or coalesce(v_post.metadata->>'manual_description','')='true' then
    raise exception 'owned published source revision with captured conflict required' using errcode='22023';
  end if;
  -- This is withdrawal, not expiration. The old expiry is neither extended
  -- nor replaced, even when it has passed while waiting on a lock.
  v_after_content:=v_actual || jsonb_build_object('status','hidden');
  v_entry:=jsonb_build_object('contract','cadu-source-conflict-quarantine-v1','operation','quarantine_source_conflict',
    'operation_id',p_request->>'operationId','at',v_now,'evidence',v_evidence,
    'before',jsonb_build_object('post',v_actual,'post_media',v_media),'after',jsonb_build_object('status','hidden'),
    'before_hash',encode(sha256(convert_to(jsonb_build_object('post',v_actual,'post_media',v_media)::text,'UTF8')),'hex'),
    'after_hash',encode(sha256(convert_to(jsonb_build_object('post',v_after_content,'post_media',v_media)::text,'UTF8')),'hex'));
  update public.posts set status='hidden',metadata=metadata || jsonb_build_object(
    'cadu_source_conflict_quarantine_history',v_history || jsonb_build_array(v_entry)) where id=p_post_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,payload)
    values(p_actor_id,'cadu_source_conflict_quarantined','post',p_post_id,v_entry);
  -- RETURNING cannot see later AFTER-trigger writes. Re-read after every
  -- mutation and reject any unrelated field or media side effect atomically.
  select * into v_post from public.posts where id=p_post_id for update;
  v_expected:=v_original_full || jsonb_build_object('status','hidden','updated_at',v_post.updated_at,'metadata',
    (v_original_full->'metadata') || jsonb_build_object('cadu_source_conflict_quarantine_history',v_history || jsonb_build_array(v_entry)));
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_expected_media from public.post_media r where post_id=p_post_id;
  if to_jsonb(v_post) is distinct from v_expected or v_media is distinct from v_expected_media then
    raise exception 'quarantine triggered an unrelated post or media change' using errcode='23514';
  end if;
  select jsonb_object_agg(key,value) into v_actual from jsonb_each(to_jsonb(v_post)) where key=any(v_keys);
  return jsonb_build_object('ok',true,'code','SOURCE_CONFLICT_QUARANTINED','post',v_actual,'post_media',v_media);
end;
$$;
revoke all on function public.kc_cadu_quarantine_source_conflict(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.kc_cadu_quarantine_source_conflict(uuid,uuid,jsonb) to service_role;
comment on function public.kc_cadu_quarantine_source_conflict(uuid,uuid,jsonb) is
  'One-way Unity source-conflict withdrawal: published to hidden only, exact post/media CAS and immutable captured evidence, no automatic reactivation.';
commit;
