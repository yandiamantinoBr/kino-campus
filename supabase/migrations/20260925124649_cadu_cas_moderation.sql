-- Scoped, reversible moderation of the Cadu's own published content.
-- No row, media, or Storage object is deleted. A full post snapshot closes
-- races with editors, publishers and other moderators before the first write.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function public.kc_cadu_moderate_post_cas(
  p_post_id uuid,
  p_actor_id uuid,
  p_expected jsonb,
  p_operation text,
  p_operation_id uuid,
  p_reason text,
  p_evidence jsonb,
  p_rollback_of uuid default null
) returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_post public.posts%rowtype;
  v_actual jsonb;
  v_expected jsonb;
  v_after jsonb;
  v_history jsonb;
  v_entry jsonb;
  v_now timestamptz := clock_timestamp();
  v_source_url text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_keys text[] := array['id','author_id','created_at','title','description','price','location',
    'module','category','status','visibility','image_url','expires_at','updated_at','metadata',
    'moderation_reason'];
begin
  if current_user <> 'service_role' or p_actor_id is null or not exists (
    select 1 from public.kc_trusted_publishers where user_id = p_actor_id
  ) then
    raise exception 'trusted service publisher required' using errcode = '42501';
  end if;
  if p_post_id is null or p_operation_id is null or p_operation is null
    or p_operation not in ('hide', 'rollback')
    or length(v_reason) < 24 or length(v_reason) > 1000
    or jsonb_typeof(p_evidence) is distinct from 'array'
    or jsonb_array_length(p_evidence) not between 1 and 5
    or octet_length(p_evidence::text) > 8192
    or jsonb_typeof(p_expected) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_expected)) <> 16
    or not (p_expected ?& v_keys)
    or octet_length(p_expected::text) > 1048576
    or (p_operation = 'hide' and p_rollback_of is not null)
    or (p_operation = 'rollback' and (p_rollback_of is null or p_rollback_of = p_operation_id)) then
    raise exception 'invalid moderation request' using errcode = '22023';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.author_id is distinct from p_actor_id
    or v_post.module not in ('eventos', 'oportunidades')
    or nullif(v_post.metadata->>'source_id', '') is null
    or nullif(v_post.metadata->>'source_url', '') is null
    or v_post.metadata->>'source_url' not like 'https://%'
    or v_post.metadata->>'manual_edits_lock' = 'true'
    or v_post.metadata->>'manual_description' = 'true'
    or v_post.metadata ? 'merged_into_post_id'
    or v_post.metadata ? 'dedup_hidden_keep_id' then
    raise exception 'owned Cadu post with primary source required' using errcode = '42501';
  end if;
  v_source_url := v_post.metadata->>'source_url';
  if not exists (
    select 1 from jsonb_array_elements(p_evidence) e
    where jsonb_typeof(e) = 'object' and e->>'url' = v_source_url
  ) then
    raise exception 'primary source evidence required' using errcode = '22023';
  end if;
  select jsonb_object_agg(key, value) into v_actual
    from jsonb_each(to_jsonb(v_post)) where key = any(v_keys);
  v_expected := p_expected || jsonb_build_object(
    'created_at', (p_expected->>'created_at')::timestamptz,
    'updated_at', (p_expected->>'updated_at')::timestamptz,
    'expires_at', (p_expected->>'expires_at')::timestamptz
  );
  if v_actual is distinct from v_expected then
    return jsonb_build_object('ok', false, 'code', 'MODERATION_CONFLICT');
  end if;

  v_history := coalesce(v_post.metadata->'cadu_moderation_history', '[]'::jsonb);
  if jsonb_typeof(v_history) is distinct from 'array' or jsonb_array_length(v_history) >= 64
    or exists (select 1 from jsonb_array_elements(v_history) e where e->>'operation_id' = p_operation_id::text) then
    raise exception 'invalid or exhausted moderation history' using errcode = '22023';
  end if;

  if p_operation = 'hide' then
    if v_post.status <> 'published' or v_post.visibility <> 'public'
      or nullif(v_post.moderation_reason, '') is not null
      or v_post.metadata ? 'cadu_moderation_lock' then
      return jsonb_build_object('ok', false, 'code', 'MODERATION_STATE_BLOCKED');
    end if;
    v_entry := jsonb_build_object(
      'operation', 'hide', 'operation_id', p_operation_id,
      'at', v_now, 'actor_id', p_actor_id, 'reason', v_reason,
      'evidence', p_evidence, 'source_url', v_source_url,
      'before', jsonb_build_object('status', v_post.status, 'visibility', v_post.visibility,
        'moderation_reason', v_post.moderation_reason, 'updated_at', v_post.updated_at)
    );
    update public.posts
       set status = 'hidden',
           moderation_reason = 'audit-cadu-editorial:' || p_operation_id::text,
           updated_at = v_now,
           metadata = jsonb_set(
             jsonb_set(v_post.metadata, '{cadu_moderation_history}', v_history || jsonb_build_array(v_entry), true),
             '{cadu_moderation_lock}', to_jsonb(p_operation_id::text), true)
     where id = p_post_id;
  else
    v_entry := v_history->-1;
    if v_post.status <> 'hidden' or v_post.visibility <> 'public'
      or v_post.moderation_reason is distinct from 'audit-cadu-editorial:' || p_rollback_of::text
      or v_post.metadata->>'cadu_moderation_lock' is distinct from p_rollback_of::text
      or v_entry->>'operation' is distinct from 'hide'
      or v_entry->>'operation_id' is distinct from p_rollback_of::text
      or v_entry->'before'->>'status' is distinct from 'published'
      or v_entry->'before'->>'visibility' is distinct from 'public'
      or v_entry->'before'->>'moderation_reason' is not null
      or v_post.expires_at is null or v_post.expires_at <= v_now then
      return jsonb_build_object('ok', false, 'code', 'MODERATION_ROLLBACK_BLOCKED');
    end if;
    v_entry := jsonb_build_object(
      'operation', 'rollback', 'operation_id', p_operation_id, 'rollback_of', p_rollback_of,
      'at', v_now, 'actor_id', p_actor_id, 'reason', v_reason,
      'evidence', p_evidence, 'source_url', v_source_url,
      'before', jsonb_build_object('status', v_post.status, 'visibility', v_post.visibility,
        'moderation_reason', v_post.moderation_reason, 'updated_at', v_post.updated_at)
    );
    update public.posts
       set status = 'published',
           moderation_reason = null,
           updated_at = v_now,
           metadata = jsonb_set(v_post.metadata - 'cadu_moderation_lock',
             '{cadu_moderation_history}', v_history || jsonb_build_array(v_entry), true)
     where id = p_post_id;
  end if;

  select jsonb_object_agg(key, value) into v_after from (
    select key, value from public.posts p, lateral jsonb_each(to_jsonb(p))
    where p.id = p_post_id and key = any(v_keys)
  ) fields;
  perform kc_private.kc_insert_audit_log(
    'cadu_post_moderation_cas', 'posts', p_post_id,
    jsonb_build_object('operation', p_operation, 'operation_id', p_operation_id,
      'rollback_of', p_rollback_of, 'reason', v_reason, 'evidence', p_evidence,
      'source_url', v_source_url, 'before', v_actual, 'after', v_after),
    p_actor_id
  );
  return jsonb_build_object('ok', true, 'code', 'MODERATION_APPLIED',
    'operation', p_operation, 'operation_id', p_operation_id, 'post', v_after);
end;
$$;

revoke all on function public.kc_cadu_moderate_post_cas(uuid, uuid, jsonb, text, uuid, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.kc_cadu_moderate_post_cas(uuid, uuid, jsonb, text, uuid, text, jsonb, uuid)
  to service_role;

commit;
