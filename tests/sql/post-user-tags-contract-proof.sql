\set ON_ERROR_STOP on
\pset pager off

-- Run after `supabase db reset --local --no-seed`.  Every fixture is
-- transactional, so this proof never changes the local development data.
begin;
set local statement_timeout = '45s';

-- Three old-enough local identities exercise the regular, administrator and
-- service-role publisher paths without the new-user moderation soft gate.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
    'post-tags-regular@example.test', 'not-used', now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, now() - interval '8 days', now()
  ),
  (
    '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
    'post-tags-admin@example.test', 'not-used', now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, now() - interval '8 days', now()
  ),
  (
    '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
    'post-tags-agent@example.test', 'not-used', now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb, now() - interval '8 days', now()
  );

insert into public.profiles (id, email, full_name, is_admin, created_at) values
  ('11111111-1111-1111-1111-111111111111', 'post-tags-regular@example.test', 'Regular tag proof', false, now() - interval '8 days'),
  ('22222222-2222-2222-2222-222222222222', 'post-tags-admin@example.test', 'Admin tag proof', true, now() - interval '8 days'),
  ('33333333-3333-3333-3333-333333333333', 'post-tags-agent@example.test', 'Agent tag proof', false, now() - interval '8 days');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

-- Automatic taxonomy deliberately has fifteen entries.  It must remain
-- independent from the six additional user-managed labels.
insert into public.posts (
  id, author_id, title, description, module, category, status, visibility, metadata
) values (
  'a1000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Prova de tags adicionais regulares', 'Conteúdo local para validar o contrato.',
  'oportunidades', 'estagios', 'published', 'public',
  jsonb_build_object(
    'tags', to_jsonb(array(select 'Taxonomia ' || n from generate_series(1, 15) as n)),
    'tagKeys', to_jsonb(array(select 'taxonomia-' || n from generate_series(1, 15) as n)),
    'userTags', jsonb_build_array(
      'Acessibilidade', 'Inclusão', 'Estudo em grupo', 'Material aberto', 'Noturno', 'Bolsista'
    ),
    -- Caller-supplied keys are intentionally ignored and derived from labels.
    'userTagKeys', jsonb_build_array('nao-confiar-no-cliente')
  )
);

do $$
declare
  v_metadata jsonb;
begin
  select metadata into v_metadata
  from public.posts
  where id = 'a1000000-0000-0000-0000-000000000001';

  if jsonb_array_length(v_metadata->'tags') <> 15 then
    raise exception 'automatic taxonomy was capped or lost';
  end if;
  if jsonb_array_length(v_metadata->'userTags') <> 6
     or not (v_metadata->'userTagKeys' @> '["acessibilidade", "estudo-em-grupo"]'::jsonb)
     or v_metadata->'userTagKeys' @> '["nao-confiar-no-cliente"]'::jsonb then
    raise exception 'regular user tag normalization failed: %', v_metadata;
  end if;
end;
$$;

-- A partial metadata replacement must not silently forget Tags.  An explicit
-- `userTags: []` remains the deliberate clear operation.
update public.posts
set metadata = jsonb_build_object('editNote', 'partial edit proof')
where id = 'a1000000-0000-0000-0000-000000000001';

do $$
declare
  v_metadata jsonb;
begin
  select metadata into v_metadata
  from public.posts
  where id = 'a1000000-0000-0000-0000-000000000001';

  if v_metadata->>'editNote' <> 'partial edit proof'
     or jsonb_array_length(v_metadata->'userTags') <> 6
     or not (v_metadata->'userTagKeys' @> '["acessibilidade"]'::jsonb) then
    raise exception 'partial update did not preserve additional tags: %', v_metadata;
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.posts (
      id, author_id, title, description, module, category, status, visibility, metadata
    ) values (
      'a1000000-0000-0000-0000-000000000002',
      '11111111-1111-1111-1111-111111111111',
      'Sétima tag regular', 'Deve ser rejeitada.', 'oportunidades', 'estagios', 'published', 'public',
      jsonb_build_object('userTags', jsonb_build_array('Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'))
    );
    raise exception 'regular seven-tag insert unexpectedly succeeded';
  exception when sqlstate '22023' then
    if SQLERRM <> 'post_user_tag_limit_exceeded' then raise; end if;
  end;
end;
$$;

-- Administrators receive twelve additional tags, and no more.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

insert into public.posts (
  id, author_id, title, description, module, category, status, visibility, metadata
) values (
  'a2000000-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  'Doze tags de administrador', 'Limite privilegiado.', 'eventos', 'academicos', 'published', 'public',
  jsonb_build_object('userTags', jsonb_build_array(
    'Admin 01', 'Admin 02', 'Admin 03', 'Admin 04', 'Admin 05', 'Admin 06',
    'Admin 07', 'Admin 08', 'Admin 09', 'Admin 10', 'Admin 11', 'Admin 12'
  ))
);

do $$
begin
  begin
    insert into public.posts (
      id, author_id, title, description, module, category, status, visibility, metadata
    ) values (
      'a2000000-0000-0000-0000-000000000002',
      '22222222-2222-2222-2222-222222222222',
      'Décima terceira tag de administrador', 'Deve ser rejeitada.', 'eventos', 'academicos', 'published', 'public',
      jsonb_build_object('userTags', jsonb_build_array(
        'Admin 01', 'Admin 02', 'Admin 03', 'Admin 04', 'Admin 05', 'Admin 06',
        'Admin 07', 'Admin 08', 'Admin 09', 'Admin 10', 'Admin 11', 'Admin 12', 'Admin 13'
      ))
    );
    raise exception 'administrator thirteen-tag insert unexpectedly succeeded';
  exception when sqlstate '22023' then
    if SQLERRM <> 'post_user_tag_limit_exceeded' then raise; end if;
  end;
end;
$$;

-- A service-role publisher represents the trusted Supabase/chat/API agent
-- path.  It gets the same twelve-tag ceiling and feeds both indexed search
-- and the exact p_tag filter.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);

insert into public.posts (
  id, author_id, title, description, module, category, status, visibility, metadata
) values (
  'a3000000-0000-0000-0000-000000000001',
  '33333333-3333-3333-3333-333333333333',
  'Registro neutro de busca', 'O termo existe apenas em uma tag adicional.',
  'eventos', 'academicos', 'published', 'public',
  jsonb_build_object('userTags', jsonb_build_array(
    'Busca Exclusiva', 'Agente 02', 'Agente 03', 'Agente 04', 'Agente 05', 'Agente 06',
    'Agente 07', 'Agente 08', 'Agente 09', 'Agente 10', 'Agente 11', 'Agente 12'
  ))
);

do $$
declare
  v_metadata jsonb;
  v_feed jsonb;
begin
  select metadata into v_metadata
  from public.posts
  where id = 'a3000000-0000-0000-0000-000000000001';

  if jsonb_array_length(v_metadata->'userTags') <> 12
     or not (v_metadata->'userTagKeys' @> '["busca-exclusiva"]'::jsonb)
     or public.kc_posts_search_tags_text(v_metadata) not ilike '%Busca Exclusiva%'
     or public.kc_posts_feed_metadata_search_text(v_metadata) not ilike '%Busca Exclusiva%' then
    raise exception 'service-role tags were not indexed for search: %', v_metadata;
  end if;

  v_feed := public.kc_get_feed_cursor(
    p_module => 'eventos', p_tag => 'busca-exclusiva', p_limit => 50,
    p_request_params => null::jsonb
  );
  if v_feed->>'ok' <> 'true'
     or not exists (
       select 1
       from jsonb_array_elements(v_feed->'posts') item
       where item->>'id' = 'a3000000-0000-0000-0000-000000000001'
     ) then
    raise exception 'p_tag did not return the user-managed tag post: %', v_feed;
  end if;

  v_feed := public.kc_get_feed_cursor(
    p_module => 'eventos', p_q => 'busca exclusiva', p_limit => 50,
    p_request_params => null::jsonb
  );
  if not exists (
    select 1
    from jsonb_array_elements(v_feed->'posts') item
    where item->>'id' = 'a3000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'free-text feed search did not return the user-managed tag post';
  end if;
end;
$$;

-- Clearing stays explicit and derives an empty key list.
update public.posts
set metadata = metadata || jsonb_build_object('userTags', '[]'::jsonb)
where id = 'a3000000-0000-0000-0000-000000000001';

do $$
declare
  v_metadata jsonb;
begin
  select metadata into v_metadata
  from public.posts
  where id = 'a3000000-0000-0000-0000-000000000001';
  if v_metadata->'userTags' <> '[]'::jsonb or v_metadata->'userTagKeys' <> '[]'::jsonb then
    raise exception 'explicit additional-tag clear did not persist: %', v_metadata;
  end if;
end;
$$;

-- Historical rows may have been imported with seven or more labels.  A title
-- or description correction must still succeed, while any active tag change
-- has to reduce the list to the ordinary six-tag ceiling.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

alter table public.posts disable trigger user;
insert into public.posts (
  id, author_id, title, description, module, category, status, visibility, metadata
) values (
  'a1000000-0000-0000-0000-000000000003',
  '11111111-1111-1111-1111-111111111111',
  'Lista histórica com sete tags', 'Importada sem truncamento.',
  'oportunidades', 'estagios', 'published', 'public',
  jsonb_build_object(
    'tags', jsonb_build_array('Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'),
    'tagKeys', jsonb_build_array('um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete'),
    'userTags', jsonb_build_array('Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'),
    'userTagKeys', jsonb_build_array('um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete')
  )
);
alter table public.posts enable trigger user;

update public.posts
set description = 'Correção não relacionada às tags históricas.'
where id = 'a1000000-0000-0000-0000-000000000003';

do $$
declare
  v_metadata jsonb;
begin
  select metadata into v_metadata
  from public.posts
  where id = 'a1000000-0000-0000-0000-000000000003';

  if jsonb_array_length(v_metadata->'userTags') <> 7 then
    raise exception 'historical user tags were not preserved on unrelated edit: %', v_metadata;
  end if;

  begin
    update public.posts
    set metadata = metadata || jsonb_build_object(
      'userTags', jsonb_build_array('Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito')
    )
    where id = 'a1000000-0000-0000-0000-000000000003';
    raise exception 'historical overflow mutation unexpectedly succeeded';
  exception when sqlstate '22023' then
    if SQLERRM <> 'post_user_tag_limit_exceeded' then raise; end if;
  end;
end;
$$;

-- A copied label must not appear twice in the indexed search text.
do $$
declare
  v_tags_text text;
  v_feed_text text;
begin
  v_tags_text := public.kc_posts_search_tags_text(jsonb_build_object(
    'tags', jsonb_build_array('Duplicada'),
    'tagKeys', jsonb_build_array('duplicada'),
    'userTags', jsonb_build_array('Duplicada'),
    'userTagKeys', jsonb_build_array('duplicada')
  ));
  v_feed_text := public.kc_posts_feed_metadata_search_text(jsonb_build_object(
    'tags', jsonb_build_array('Duplicada'),
    'tagKeys', jsonb_build_array('duplicada'),
    'userTags', jsonb_build_array('Duplicada'),
    'userTagKeys', jsonb_build_array('duplicada')
  ));

  if v_tags_text <> 'Duplicada'
     or (length(lower(v_feed_text)) - length(replace(lower(v_feed_text), 'duplicada', ''))) / length('duplicada') <> 1 then
    raise exception 'legacy/canonical tag copy inflated search text: tags=% feed=%', v_tags_text, v_feed_text;
  end if;
end;
$$;

rollback;
\echo 'KC_PROOF post_user_tags=pass transaction_rollback=pass'
