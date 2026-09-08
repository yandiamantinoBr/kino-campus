-- Withdraw only the contradictory GIMON legacy free claim. Never repair its
-- blank identity, lifecycle, text, links or media through this operation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create or replace function public.kc_cadu_retract_legacy_free_claim(p_post_id uuid, p_actor_id uuid, p_request jsonb)
returns jsonb language plpgsql security invoker
set search_path = '' set lock_timeout = '5s' set statement_timeout = '15s'
as $$
declare
  v_post public.posts%rowtype;
  v_actual jsonb;
  v_expected jsonb;
  v_media jsonb;
  v_expected_media jsonb;
  v_evidence jsonb;
  v_history jsonb;
  v_entry jsonb;
  v_after_content jsonb;
  v_now timestamptz;
  v_captured timestamptz;
  v_primary constant text := 'https://fanut.ufg.br/n/200351';
  v_official constant text := 'https://ufg.br/e/39235-gimon-2026-global-insights-in-microbiome-obesity-nutrition-conference';
  v_excerpt constant text := 'As inscrições já estão abertas na plataforma Even3, com valores promocionais de acordo com o lote vigente e categorias diferenciadas para estudantes de graduação, pós-graduação e profissionais.';
  v_keys constant text[] := array['id','author_id','created_at','title','description','price','location','module','category','status','visibility','image_url','expires_at','updated_at','metadata'];
begin
  if current_user <> 'service_role' then raise exception 'service_role required' using errcode='42501'; end if;
  if p_actor_id is null or not exists(select 1 from public.kc_trusted_publishers where user_id=p_actor_id) then
    raise exception 'trusted publisher required' using errcode='42501';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object' or octet_length(p_request::text)>1048576 then
    raise exception 'invalid retraction request' using errcode='22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_request))<>5 or not(p_request ?& array['contract','operationId','expected','expectedMedia','evidence'])
    or p_request->>'contract' is distinct from 'cadu-legacy-free-retraction-v1'
    or jsonb_typeof(p_request->'operationId') is distinct from 'string'
    or (p_request->>'operationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(p_request->'expected') is distinct from 'object'
    or jsonb_typeof(p_request->'expectedMedia') is distinct from 'array'
    or jsonb_typeof(p_request->'evidence') is distinct from 'object' then
    raise exception 'closed retraction schema required' using errcode='22023';
  end if;
  v_expected:=p_request->'expected'; v_evidence:=p_request->'evidence';
  if (select count(*) from jsonb_object_keys(v_expected))<>15 or not(v_expected ?& v_keys)
    or (select count(*) from jsonb_object_keys(v_evidence))<>9
    or not(v_evidence ?& array['primaryUrl','primaryAccess','corroboratingUrl','corroboratingSha256','capturedAt','officialExcerpt','postExcerpt','relationship','primaryIdentityPreserved'])
    or v_evidence->>'primaryUrl' is distinct from v_primary
    or v_evidence->>'primaryAccess' is distinct from 'unavailable_not_fetched'
    or v_evidence->>'corroboratingUrl' is distinct from v_official
    or v_evidence->>'relationship' is distinct from 'existing_alias_and_internal_contradiction'
    or v_evidence->'primaryIdentityPreserved' is distinct from 'true'::jsonb
    or jsonb_typeof(v_evidence->'corroboratingSha256') is distinct from 'string'
    or (v_evidence->>'corroboratingSha256') !~ '^[a-f0-9]{64}$'
    or v_evidence->>'officialExcerpt' is distinct from v_excerpt
    or jsonb_typeof(v_evidence->'postExcerpt') is distinct from 'string'
    or length(v_evidence->>'postExcerpt') not between 20 and 500
    or strpos(v_evidence->>'postExcerpt','valores por lote')=0
    or jsonb_typeof(v_evidence->'capturedAt') is distinct from 'string'
    or (v_evidence->>'capturedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or jsonb_array_length(p_request->'expectedMedia')>24 then
    raise exception 'invalid exact source corroboration or snapshot' using errcode='22023';
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
  -- FOR UPDATE on the parent serializes concurrent FK inserts. Existing
  -- children are locked before comparison, in the same order as integrity.
  perform 1 from public.post_media where post_id=p_post_id order by id for update;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_media from public.post_media r where post_id=p_post_id;
  v_now:=clock_timestamp();
  v_history:=coalesce(v_post.metadata->'cadu_legacy_free_retraction_history','[]'::jsonb);
  if jsonb_typeof(v_history)<>'array' or jsonb_array_length(v_history)>49 then raise exception 'invalid retained history' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(v_history) r where jsonb_typeof(r) is distinct from 'object') then
    raise exception 'invalid retained history entry' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(v_history) r where r->>'operation_id'=p_request->>'operationId') then
    return jsonb_build_object('ok',false,'code','EDIT_CONFLICT');
  end if;
  select jsonb_object_agg(key,value) into v_actual from jsonb_each(to_jsonb(v_post)) where key=any(v_keys);
  v_expected:=v_expected || jsonb_build_object('created_at',(v_expected->>'created_at')::timestamptz,
    'updated_at',(v_expected->>'updated_at')::timestamptz,'expires_at',(v_expected->>'expires_at')::timestamptz);
  if v_actual is distinct from v_expected or v_media is distinct from v_expected_media then
    return jsonb_build_object('ok',false,'code','EDIT_CONFLICT');
  end if;
  if v_post.price is distinct from 0::numeric or v_post.metadata->'gratuito' is distinct from 'true'::jsonb
    or v_post.metadata->'source_id' is distinct from '""'::jsonb or v_post.metadata->>'source_url' is distinct from v_primary
    or v_post.status is distinct from 'published' or v_post.visibility is distinct from 'public' or v_post.module is distinct from 'eventos'
    or coalesce(v_post.title,'') !~* '\mGIMON[[:space:]]+2026\M'
    or nullif(v_post.metadata->>'merged_into_post_id','') is not null or nullif(v_post.metadata->>'dedup_hidden_keep_id','') is not null
    or coalesce(v_post.metadata->>'manual_edits_lock','')='true' or coalesce(v_post.metadata->>'manual_description','')='true'
    or strpos(coalesce(v_post.description,''),v_evidence->>'postExcerpt')=0
    or jsonb_typeof(v_post.metadata->'merged_sources') is distinct from 'array' then
    raise exception 'legacy contradictory free claim required' using errcode='22023';
  end if;
  if not exists(select 1 from jsonb_array_elements(v_post.metadata->'merged_sources') r where r->>'source_url'=v_official) then
    raise exception 'corroboration must already be an inherited alias' using errcode='22023';
  end if;
  if v_post.expires_at is null or v_post.expires_at<=v_now then return jsonb_build_object('ok',false,'code','LEGACY_FREE_RETRACTION_EXPIRED'); end if;
  v_captured:=(v_evidence->>'capturedAt')::timestamptz;
  if v_captured<v_now-interval '24 hours' or v_captured>v_now+interval '1 minute' then
    raise exception 'fresh corroboration required' using errcode='22023';
  end if;
  -- Hashes cover complete before/derived content and unchanged media, using
  -- PostgreSQL jsonb text bytes. after_hash excludes this new history entry
  -- and uses the pre-write updated_at; it is not a hash of the final row.
  v_after_content:=v_actual || jsonb_build_object('price',null,'metadata',v_post.metadata || jsonb_build_object('gratuito',false));
  v_entry:=jsonb_build_object('contract','cadu-legacy-free-retraction-v1','operation','retract_legacy_free_claim',
    'operation_id',p_request->>'operationId','at',v_now,'evidence',v_evidence,
    'before',jsonb_build_object('post',v_actual,'post_media',v_media),'after',jsonb_build_object('price',null,'gratuito',false),
    'before_hash',encode(sha256(convert_to(jsonb_build_object('post',v_actual,'post_media',v_media)::text,'UTF8')),'hex'),
    'after_hash',encode(sha256(convert_to(jsonb_build_object('post',v_after_content,'post_media',v_media)::text,'UTF8')),'hex'));
  update public.posts set price=null,metadata=metadata || jsonb_build_object('gratuito',false,
    'cadu_legacy_free_retraction_history',v_history || jsonb_build_array(v_entry)) where id=p_post_id returning * into v_post;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,payload)
    values(p_actor_id,'cadu_legacy_free_claim_retracted','post',p_post_id,v_entry);
  -- RETURNING predates any additional write performed by AFTER triggers.
  -- Re-read after every write, including audit triggers, before the final CAS
  -- assertion so an unexpected side effect rolls back with the whole RPC.
  select * into v_post from public.posts where id=p_post_id for update;
  select jsonb_object_agg(key,value) into v_actual from jsonb_each(to_jsonb(v_post)) where key=any(v_keys);
  v_expected:=v_after_content || jsonb_build_object('updated_at',v_post.updated_at,'metadata',
    (v_after_content->'metadata') || jsonb_build_object('cadu_legacy_free_retraction_history',v_history || jsonb_build_array(v_entry)));
  select coalesce(jsonb_agg(to_jsonb(r) order by r.sort_order,r.id),'[]'::jsonb) into v_expected_media
    from public.post_media r where post_id=p_post_id;
  if v_actual is distinct from v_expected or v_media is distinct from v_expected_media then
    -- Legacy category/metadata triggers may normalize unrelated fields. Such a
    -- side effect must roll the entire transaction back, not become a 502 after
    -- an already committed mutation with an unexpected receipt.
    raise exception 'retraction triggered an unrelated post or media change' using errcode='23514';
  end if;
  return jsonb_build_object('ok',true,'code','LEGACY_FREE_RETRACTED','post',v_actual,'post_media',v_media);
end;
$$;
revoke all on function public.kc_cadu_retract_legacy_free_claim(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.kc_cadu_retract_legacy_free_claim(uuid,uuid,jsonb) to service_role;
comment on function public.kc_cadu_retract_legacy_free_claim(uuid,uuid,jsonb) is
  'GIMON legacy free-claim withdrawal only; complete post/media CAS, inherited alias corroboration, blank identity preserved, atomic history/audit.';
commit;
