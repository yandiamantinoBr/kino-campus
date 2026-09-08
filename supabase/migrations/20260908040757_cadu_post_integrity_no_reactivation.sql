-- Preserve the applied integrity RPC contract; add an after-lock validity fence.
-- Historical inactive repairs remain possible, but this route cannot reactivate.
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
  v_now timestamptz;
  v_next_expiry timestamptz;
  v_axis text;
  v_side integer;
  v_parts jsonb;
  v_meta jsonb;
  v_value text;
  v_date timestamptz;
  v_status_keys text[];
  v_date_keys text[];
  v_date_values text[];
  v_extra_dates text[];
  v_terminal_dates integer;
  v_index integer;
  v_closed boolean[];
  v_active boolean[];
  v_known_future boolean[];
  v_active_repair boolean;
  v_false_apply boolean[] := array[false,false];
  v_true_apply boolean[] := array[false,false];
  v_application_closed_after boolean := false;
  v_application_open_claim boolean := false;
  v_application_future_opening boolean := false;
  v_application_keys text[] := array['applicationDeadline','application_deadline','applicationDeadlineAt','application_deadline_at',
    'deadlineAt','deadline_at','deadlineDate','deadline_date','deadline','dataLimite','data_limite','inscricoesAte',
    'inscricoes_ate','prazoInscricao','prazo_inscricao','submissionDeadline','submission_deadline','prazo'];
  v_event_end_keys text[] := array['eventEndsAt','event_ends_at','eventEnd','event_end','endsAt','ends_at','endAt',
    'end_at','dataFimEvento','data_fim_evento','dataFim','data_fim','dateEnd','date_end','dateEndAt','date_end_at'];
  v_event_start_keys text[] := array['eventStartsAt','event_starts_at','eventStart','event_start','startsAt','starts_at',
    'startAt','start_at','dataInicioEvento','data_inicio_evento','dataEvento','data_evento','eventDate','event_date',
    'event_date_detected','dateStart','date_start','date','data'];
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
  end if;

  -- Both parent and optional media locks have been acquired; no mutation has
  -- occurred. now()/current_timestamp would miss expiry while waiting on locks.
  v_now := clock_timestamp();
  v_next_expiry := (p_update->>'expires_at')::timestamptz;
  v_active_repair := coalesce(v_entry#>>'{quality_context,context}'='existing_active_post_repair',false);
  if v_active_repair then
    if jsonb_typeof(v_entry->'observed_score') is distinct from 'number'
      or jsonb_typeof(v_entry#>'{quality_context,observed_score}') is distinct from 'number' then
      return jsonb_build_object('ok',false,'code','INTEGRITY_ACTIVE_REPAIR_EXPIRED');
    end if;
    if v_entry->'observed_score' is distinct from v_entry#>'{quality_context,observed_score}'
      or (v_entry->>'observed_score')::numeric < 0 or (v_entry->>'observed_score')::numeric >= 0.70
      or v_entry#>>'{quality_context,warning}' is distinct from 'existing_active_post_repair_below_auto_publish_threshold'
      or v_post.status <> 'published' or v_post.visibility <> 'public'
      or v_post.expires_at is null or v_post.expires_at <= v_now
      or exists (select 1 from unnest(array['expired','isExpired','is_expired','isClosed','is_closed']) k
        where v_post.metadata->k='true'::jsonb) then
      return jsonb_build_object('ok',false,'code','INTEGRITY_ACTIVE_REPAIR_EXPIRED');
    end if;
  end if;
  if (v_post.status='closed' or (v_post.expires_at is not null and v_post.expires_at <= v_now))
    and (v_next_expiry is null or v_next_expiry > v_now) then
    return jsonb_build_object('ok',false,'code','INTEGRITY_REACTIVATION_BLOCKED');
  end if;
  -- The public lifecycle consumer reads these strict booleans at metadata root.
  -- A replacement terminal marker can preserve closure; strings are not proof.
  if exists (select 1 from unnest(array['expired','isExpired','is_expired','isClosed','is_closed']) k
    where v_post.metadata->k='true'::jsonb)
    and not exists (select 1 from unnest(array['expired','isExpired','is_expired','isClosed','is_closed']) k
      where p_update->'metadata'->k='true'::jsonb) then
    return jsonb_build_object('ok',false,'code','INTEGRITY_REACTIVATION_BLOCKED');
  end if;
  foreach v_axis in array array['application','event','lifecycle'] loop
    -- An opportunity may contain a future/past examination date. That event
    -- date is not the end of its application window.
    if v_axis='event' and v_post.module <> 'eventos' then continue; end if;
    v_closed := array[false,false]; v_active := array[false,false]; v_known_future := array[false,false];
    v_status_keys := case when v_axis='lifecycle' then array['temporalStatus','lifecycleStatus','lifecycle_status']
      else array[v_axis || 'Status',v_axis || '_status'] end;
    v_date_keys := case v_axis when 'application' then v_application_keys
      when 'event' then v_event_end_keys else array[]::text[] end;
    for v_side in 1..2 loop
      v_meta := case when v_side=1 then v_post.metadata else p_update->'metadata' end;
      v_parts := jsonb_build_array(v_meta,
        case when jsonb_typeof(v_meta->'dates')='object' then v_meta->'dates' else '{}'::jsonb end,
        case when jsonb_typeof(v_meta->'validity')='object' then v_meta->'validity' else '{}'::jsonb end);
      for v_value in select lower(btrim(p->>k)) from jsonb_array_elements(v_parts) p cross join unnest(v_status_keys) k
        where p->>k is not null loop
        if v_value in ('closed','expired','past','ended','encerrado','encerrada','cancelled','canceled',
          'cancelado','cancelada','finalizado','finalizada','deleted','hidden','archived') then v_closed[v_side] := true; end if;
        if v_value in ('open','scheduled','upcoming','active','ongoing','in_progress','future') then v_active[v_side] := true; end if;
      end loop;
      select coalesce(array_agg(p->>k),array[]::text[]) into v_date_values
        from jsonb_array_elements(v_parts) p cross join unnest(v_date_keys) k where nullif(p->>k,'') is not null;
      -- Public generic expiry is a fallback only when the module has no date.
      -- activeUntil precedes the typed column; metadata expiry follows it.
      -- verificationExpiresAt is not a separate public expiry contract.
      if v_axis='lifecycle' and not exists (
        select 1 from jsonb_array_elements(jsonb_build_array(v_meta,coalesce(v_meta->'dates','{}'::jsonb))) p
          cross join unnest(case when v_post.module='eventos' then v_event_end_keys || v_event_start_keys else v_application_keys end) k
          where nullif(p->>k,'') is not null
      ) then
        select coalesce(array_agg(p->>k),array[]::text[]) into v_date_values
          from jsonb_array_elements(jsonb_build_array(v_meta,coalesce(v_meta->'dates','{}'::jsonb))) p
          cross join unnest(array['activeUntil','active_until']) k where nullif(p->>k,'') is not null;
        if cardinality(v_date_values)=0 and (case when v_side=1 then v_post.expires_at else v_next_expiry end) is null then
          select coalesce(array_agg(p->>k),array[]::text[]) into v_date_values
            from jsonb_array_elements(jsonb_build_array(v_meta,coalesce(v_meta->'dates','{}'::jsonb))) p
            cross join unnest(array['expiresAt','expires_at','validUntil','valid_until','validThrough','data_encerramento','expirationDate','expiration_date']) k
            where nullif(p->>k,'') is not null;
        end if;
      end if;
      v_extra_dates := array[]::text[];
      if v_axis='event' then
        select coalesce(array_agg(p->>k),array[]::text[]) into v_extra_dates from jsonb_array_elements(v_parts) p
          cross join unnest(v_event_start_keys) k
          where nullif(p->>k,'') is not null;
        if cardinality(v_date_values)=0 then v_date_values := v_extra_dates; v_extra_dates := array[]::text[]; end if;
      end if;
      v_terminal_dates := cardinality(v_date_values);
      -- Starts do not expire an ongoing event with a known end. A newly future
      -- start still cannot resurrect an already ended event via conflicting aliases.
      if v_side=2 then v_date_values := v_date_values || v_extra_dates; end if;
      for v_index in 1..cardinality(v_date_values) loop
        v_value := v_date_values[v_index];
        if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          v_date := ((v_value::date + 1)::timestamp at time zone 'America/Sao_Paulo');
        elsif v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
          v_date := v_value::timestamptz;
        else raise exception 'invalid integrity temporal value' using errcode = '22023'; end if;
        if v_index <= v_terminal_dates and v_date <= v_now then v_closed[v_side] := true; end if;
        if v_date > v_now then v_active[v_side] := true; v_known_future[v_side] := true; end if;
      end loop;
      if v_axis='application' then
        for v_value in select lower(btrim(p->>k)) from jsonb_array_elements(v_parts) p
          cross join unnest(array['canApply','can_apply']) k where p->>k is not null loop
          if v_value='false' then v_false_apply[v_side] := true; end if;
          if v_value='true' then v_true_apply[v_side] := true; v_active[v_side] := true; end if;
        end loop;
        if v_side=2 then
          v_application_closed_after := v_closed[2];
          select exists (select 1 from jsonb_array_elements(v_parts) p cross join unnest(v_status_keys) k
            where lower(btrim(p->>k)) in ('open','active','accepting')) into v_application_open_claim;
          for v_value in select p->>k from jsonb_array_elements(v_parts) p
            cross join unnest(array['applicationOpensAt','application_opens_at']) k where nullif(p->>k,'') is not null loop
            -- An announced opening is a start instant, not permission to apply.
            if v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
              v_date := (v_value::date::timestamp at time zone 'America/Sao_Paulo');
            elsif v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
              v_date := v_value::timestamptz;
            else raise exception 'invalid integrity temporal value' using errcode = '22023'; end if;
            if v_date > v_now then v_application_future_opening := true; end if;
          end loop;
        end if;
      end if;
    end loop;
    if v_active_repair and ((v_axis=(case when v_post.module='eventos' then 'event' else 'application' end)
      and (v_closed[1] or not v_known_future[1])) or (v_axis='lifecycle' and v_closed[1])) then
      return jsonb_build_object('ok',false,'code','INTEGRITY_ACTIVE_REPAIR_EXPIRED');
    end if;
    if v_closed[1] and (not v_closed[2] or v_active[2]) then
      return jsonb_build_object('ok',false,'code','INTEGRITY_REACTIVATION_BLOCKED');
    end if;
  end loop;
  if v_false_apply[1] and (v_true_apply[2] or v_application_open_claim or
    (not v_false_apply[2] and not v_application_closed_after and not v_application_future_opening)) then
    return jsonb_build_object('ok',false,'code','INTEGRITY_REACTIVATION_BLOCKED');
  end if;

  if p_media is not null then
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
  'Service-role-only Cadu complete-snapshot CAS; after-lock validity fence forbids reactivation; immutable source/media and atomic audit.';
commit;
