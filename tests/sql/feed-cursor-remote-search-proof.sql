\set ON_ERROR_STOP on
\pset pager off

select
  md5(pg_get_functiondef(
    'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure
  )) as legacy_cursor_hash,
  md5(pg_get_indexdef('public.idx_posts_fts'::regclass)) as legacy_fts_index_hash,
  md5(pg_get_indexdef('public.posts_legacy_id_unique'::regclass)) as legacy_id_index_hash,
  (to_regprocedure('public.kc_posts_feed_normalize_search_text(text)') is not null) as had_normalize_function,
  (to_regprocedure('public.kc_posts_feed_search_value(jsonb)') is not null) as had_value_function,
  (to_regprocedure('public.kc_posts_feed_metadata_search_text(jsonb)') is not null) as had_metadata_function,
  (to_regprocedure('public.kc_posts_feed_search_text(text,text,text,text,jsonb)') is not null) as had_text_function,
  (to_regclass('public.idx_posts_feed_cursor_search_trgm') is not null) as had_cursor_index,
  coalesce((
    select tgenabled::text
    from pg_trigger
    where tgrelid = 'public.posts'::regclass
      and tgname = 'trg_anti_spam_gate'
      and not tgisinternal
  ), '') as anti_spam_trigger_state
\gset

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

\ir ../../supabase/migrations/20260808134510_align_feed_cursor_remote_search.sql

-- Fixtures exercise the read RPC, not write-side anti-spam policy. Disabling
-- this one trigger is transactional and the final ROLLBACK restores its state.
do $$
begin
  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.posts'::regclass
      and tgname = 'trg_anti_spam_gate'
      and not tgisinternal
  ) then
    execute 'alter table public.posts disable trigger trg_anti_spam_gate';
  end if;
end;
$$;

insert into public.posts (
  id, title, description, location, module, category, metadata,
  status, visibility, created_at, updated_at
) values
  (
    '89000000-0000-0000-0000-000000000001',
    'Registro neutro um', 'Conteudo sem o termo procurado', null,
    'oportunidades', 'cursos-capacitacoes', '{}'::jsonb,
    'published', 'public', now(), now()
  ),
  (
    '89000000-0000-0000-0000-000000000002',
    'Registro neutro dois', 'Conteudo sem o termo procurado', 'Praça Ônix Proof',
    'eventos', 'academicos', '{}'::jsonb,
    'published', 'public', now() - interval '1 second', now()
  ),
  (
    '89000000-0000-0000-0000-000000000003',
    'Registro neutro tres', 'Conteudo sem o termo procurado', null,
    'eventos', 'academicos', '{"tagKeys":["Marcador Jade Proof"]}'::jsonb,
    'published', 'public', now() - interval '2 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000004',
    'Registro neutro quatro', 'Conteudo sem o termo procurado', null,
    'eventos', 'academicos', '{"areaLabel":"Setor Âmbar Proof"}'::jsonb,
    'published', 'public', now() - interval '3 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000005',
    'Registro neutro cinco', 'Conteudo sem o termo procurado', null,
    'eventos', 'academicos', '{"chaveSecretaProof":"valor neutro proof"}'::jsonb,
    'published', 'public', now() - interval '4 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000006',
    'Registro neutro seis', 'Conteudo sem o termo procurado', 'Sala para Estudo Stopword Proof',
    'eventos', 'academicos', '{}'::jsonb,
    'published', 'public', now() - interval '5 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000007',
    'Registro neutro sete', 'Conteudo sem o termo procurado', null,
    'eventos', 'academicos', '{"areaLabel":"IA Aplicada Short Proof"}'::jsonb,
    'published', 'public', now() - interval '6 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000008',
    'Conexao Multiterme Proof', null, 'Dourado',
    'eventos', null, '{}'::jsonb,
    'published', 'public', now() - interval '7 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000009',
    'Registro neutro nove', 'Conteudo sem o termo procurado', 'Campus Prefix Proof',
    'eventos', 'academicos', '{}'::jsonb,
    'published', 'public', now() - interval '8 seconds', now()
  ),
  (
    '89000000-0000-0000-0000-000000000010',
    'Registro neutro dez', 'Conteudo sem o termo procurado', E'Caminho Slash \\ Proof',
    'eventos', 'academicos', '{}'::jsonb,
    'published', 'public', now() - interval '9 seconds', now()
  );

select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  v_result jsonb;
  v_plan json;
  v_signature text;
  v_helper regprocedure;
begin
  select pg_get_function_identity_arguments(
    'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure
  ) into v_signature;
  if v_signature <> 'p_module text, p_modules text[], p_category text, p_subcategory text, p_tag text, p_q text, p_sort_by text, p_limit integer, p_cursor text, p_request_params jsonb' then
    raise exception 'feed cursor signature changed: %', v_signature;
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => null::text, p_limit => 50,
    p_request_params => null::jsonb
  );
  if v_result->>'ok' <> 'true'
     or jsonb_typeof(v_result->'posts') <> 'array'
     or not (v_result ?& array['hasMore', 'has_more', 'nextCursor', 'next_cursor'])
     or not exists (
       select 1 from jsonb_array_elements(v_result->'posts') item
       where item->>'id' = '89000000-0000-0000-0000-000000000002'
     ) then
    raise exception 'empty-query cursor behavior or response shape changed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'oportunidades', p_q => 'cursos capacitações', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'category-only feed search failed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'praca onix proof', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'location-only feed search failed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'marcador jade proof', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'tag-only feed search failed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'setor ambar proof', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'accent-insensitive metadata feed search failed';
  end if;

  if public.kc_posts_feed_metadata_search_text(
    '{"chaveSecretaProof":"valor neutro proof"}'::jsonb
  ) <> '' then
    raise exception 'non-allowlisted metadata leaked into searchable text';
  end if;
  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'chavesecretaproof', p_limit => 50,
    p_request_params => null::jsonb
  );
  if exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000005'
  ) then
    raise exception 'JSON key name produced a false-positive feed match';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'para', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000006'
  ) then
    raise exception 'stopword substring feed search failed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'ia', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000007'
  ) then
    raise exception 'short-query substring feed search failed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'camp', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000009'
  ) then
    raise exception 'substring prefix camp-to-campus feed search failed';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => E'slash \\ proof', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000010'
  ) then
    raise exception 'literal LIKE escape feed search failed';
  end if;

  -- This match spans the title and location documents. It proves the combined
  -- GIN expression does not require every term to live in the same old field.
  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'multiterme proof dourado', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000008'
  ) then
    raise exception 'multi-term cross-field feed search failed';
  end if;

  -- Browser search is a normalized substring search, so term order still
  -- matters after the GIN candidate filter.
  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'dourado multiterme', p_limit => 50,
    p_request_params => null::jsonb
  );
  if exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000008'
  ) then
    raise exception 'multi-term feed search diverged from local substring order';
  end if;

  v_result := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'multiterme ausente', p_limit => 50,
    p_request_params => null::jsonb
  );
  if exists (
    select 1 from jsonb_array_elements(v_result->'posts') item
    where item->>'id' = '89000000-0000-0000-0000-000000000008'
  ) then
    raise exception 'multi-term feed search ignored a required term';
  end if;

  if not exists (
    select 1
    from pg_index
    where indexrelid = 'public.idx_posts_fts'::regclass
      and indisvalid
      and indisready
  ) or pg_get_indexdef('public.idx_posts_fts'::regclass) not like '%kc_posts_search_document%' then
    raise exception 'existing idx_posts_fts contract changed or became invalid';
  end if;

  perform set_config('enable_seqscan', 'off', true);
  perform set_config('enable_indexscan', 'off', true);
  perform set_config('enable_bitmapscan', 'on', true);
  -- The empty local database has no useful statistics, so its legacy_id btree
  -- otherwise wins on synthetic cost alone. Remove that competing path only
  -- inside this transaction to prove the trigram operator/index pairing.
  execute 'alter table public.posts drop constraint posts_legacy_id_unique';
  execute $plan$
    explain (format json, costs off)
    select p.id
    from public.posts p
    where p.legacy_id is null
      and public.kc_posts_feed_search_text(
        p.title, p.description, p.category, p.location, p.metadata
      ) like '%campus prefix proof%'
  $plan$ into v_plan;
  if v_plan::text not like '%idx_posts_feed_cursor_search_trgm%' then
    raise exception 'normalized feed trigram index is not usable: %', v_plan;
  end if;

  foreach v_helper in array array[
    'public.kc_posts_feed_normalize_search_text(text)'::regprocedure,
    'public.kc_posts_feed_search_value(jsonb)'::regprocedure,
    'public.kc_posts_feed_metadata_search_text(jsonb)'::regprocedure,
    'public.kc_posts_feed_search_text(text,text,text,text,jsonb)'::regprocedure
  ] loop
    if exists (
      select 1
      from pg_proc
      where oid = v_helper
        and (provolatile <> 'i' or proparallel <> 's' or prosecdef)
    ) then
      raise exception 'feed search helper must be immutable, parallel safe and invoker: %', v_helper;
    end if;

    if exists (
         select 1
         from pg_proc proc
         cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
         where proc.oid = v_helper
           and acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       )
       or not has_function_privilege('anon', v_helper::oid, 'execute')
       or not has_function_privilege('authenticated', v_helper::oid, 'execute')
       or not has_function_privilege('service_role', v_helper::oid, 'execute') then
      raise exception 'feed search helper grants are not least privilege: %', v_helper;
    end if;
  end loop;
end;
$$;

rollback;

select (
  md5(pg_get_functiondef(
    'public.kc_get_feed_cursor(text,text[],text,text,text,text,text,integer,text,jsonb)'::regprocedure
  )) = :'legacy_cursor_hash'
  and md5(pg_get_indexdef('public.idx_posts_fts'::regclass)) = :'legacy_fts_index_hash'
  and md5(pg_get_indexdef('public.posts_legacy_id_unique'::regclass)) = :'legacy_id_index_hash'
  and (to_regprocedure('public.kc_posts_feed_normalize_search_text(text)') is not null) = :'had_normalize_function'::boolean
  and (to_regprocedure('public.kc_posts_feed_search_value(jsonb)') is not null) = :'had_value_function'::boolean
  and (to_regprocedure('public.kc_posts_feed_metadata_search_text(jsonb)') is not null) = :'had_metadata_function'::boolean
  and (to_regprocedure('public.kc_posts_feed_search_text(text,text,text,text,jsonb)') is not null) = :'had_text_function'::boolean
  and (to_regclass('public.idx_posts_feed_cursor_search_trgm') is not null) = :'had_cursor_index'::boolean
  and coalesce((
    select tgenabled::text
    from pg_trigger
    where tgrelid = 'public.posts'::regclass
      and tgname = 'trg_anti_spam_gate'
      and not tgisinternal
  ), '') = :'anti_spam_trigger_state'
) as rollback_ok
\gset

\if :rollback_ok
\echo 'KC_PROOF feed_cursor_remote_search=pass transaction_rollback=pass'
\else
\echo 'KC_PROOF feed_cursor_remote_search=fail transaction_rollback=fail'
\quit 1
\endif
