-- Run after 20260808123000_feed_taxonomy_canonicalization.sql.
do $$
begin
  if public.kc_feed_category_key('oportunidades', 'emprego') <> 'empregos' then
    raise exception 'opportunity singular alias was not canonicalized';
  end if;
  if public.kc_feed_category_key('moradia', 'apartamento') <> 'apartamentos' then
    raise exception 'housing singular alias was not canonicalized';
  end if;
  if public.kc_feed_category_key('caronas', 'ofereco carona') <> 'ofereco' then
    raise exception 'ride legacy category was not canonicalized';
  end if;
  if public.kc_feed_category_key('achados-perdidos', 'achado') <> 'encontrados' then
    raise exception 'lost-found legacy category was not canonicalized';
  end if;
  if public.kc_feed_market_category_key('ingresso') <> 'ingressos' then
    raise exception 'market ticket alias was not canonicalized';
  end if;
  if public.kc_feed_opportunity_type_key('cursos-capacitacoes', '') <> 'curso-capacitacao' then
    raise exception 'opportunity course type was not normalized';
  end if;
  if public.kc_feed_ride_feature_key('4-mais-lugares') <> 'quatro-mais-lugares' then
    raise exception 'ride four-plus alias was not canonicalized';
  end if;
  if public.kc_feed_ride_feature_json('["4-mais-lugares","quatro-mais-lugares"]'::jsonb)
     <> '["quatro-mais-lugares"]'::jsonb then
    raise exception 'ride feature aliases were not deduplicated';
  end if;

  if exists (
    select 1
    from public.posts p
    where p.category is distinct from public.kc_feed_category_key(p.module, p.category)
  ) then
    raise exception 'mechanical category aliases remain after backfill';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_posts_canonicalize_feed_fields'
      and not tgisinternal
  ) then
    raise exception 'canonicalization trigger is missing';
  end if;
end;
$$;

-- The fixture exercises the taxonomy trigger only. The anti-spam trigger
-- rejects synthetic rows without an authenticated author, so suspend it for
-- this transaction-scoped proof and restore it before returning.
alter table public.posts disable trigger trg_anti_spam_gate;

do $$
declare
  v_rejected boolean := false;
begin
  begin
    insert into public.posts (id, title, module, category, metadata, visibility, status)
    values (
      '00000000-0000-4000-8000-00000000dead',
      'Invalid metadata shape proof',
      'eventos',
      'palestra',
      '[]'::jsonb,
      'public',
      'published'
    );
  exception when sqlstate '22023' then
    v_rejected := true;
  end;

  if not v_rejected then
    delete from public.posts where id = '00000000-0000-4000-8000-00000000dead';
    raise exception 'trigger accepted non-object metadata';
  end if;
end;
$$;

insert into public.posts (
  id,
  title,
  module,
  category,
  metadata,
  price,
  visibility,
  status
) values (
  '00000000-0000-4000-8000-00000000cafe',
  'Feed taxonomy trigger proof',
  'caronas',
  'ofereco carona',
  jsonb_build_object(
    'category', 'ofereco carona',
    'categoryKey', 'ofereco-carona',
    'categoriaKey', 'ofereco carona',
    'caronasFeatureKeys', jsonb_build_array('4-mais-lugares', 'quatro-mais-lugares', 'nao-fumantes'),
    'tagKeys', jsonb_build_array('4-mais-lugares', 'quatro-mais-lugares'),
    'contribuicao', '12.50'
  ),
  null,
  'public',
  'published'
);

do $$
declare
  v_post public.posts%rowtype;
begin
  select * into strict v_post
  from public.posts
  where id = '00000000-0000-4000-8000-00000000cafe';

  if v_post.category <> 'ofereco'
     or v_post.metadata->>'category' <> 'ofereco'
     or v_post.metadata->>'categoryKey' <> 'ofereco'
     or v_post.metadata->>'categoriaKey' <> 'ofereco' then
    raise exception 'trigger did not synchronize ride category aliases: %', v_post.metadata;
  end if;
  if v_post.metadata->'caronasFeatureKeys' <> '["quatro-mais-lugares","sem-fumar"]'::jsonb then
    raise exception 'trigger did not canonicalize and deduplicate ride features: %', v_post.metadata->'caronasFeatureKeys';
  end if;
  if v_post.metadata->'tagKeys' <> '["quatro-mais-lugares"]'::jsonb then
    raise exception 'trigger did not canonicalize ride tags: %', v_post.metadata->'tagKeys';
  end if;
  if v_post.price <> 12.50 then
    raise exception 'trigger did not derive ride contribution price: %', v_post.price;
  end if;
end;
$$;

update public.posts
set
  module = 'oportunidades',
  category = 'emprego',
  metadata = jsonb_build_object(
    'category', 'emprego',
    'categoryKey', 'emprego',
    'remuneracao', '9000.00'
  ),
  price = null
where id = '00000000-0000-4000-8000-00000000cafe';

do $$
declare
  v_post public.posts%rowtype;
begin
  select * into strict v_post
  from public.posts
  where id = '00000000-0000-4000-8000-00000000cafe';

  if v_post.category <> 'empregos'
     or v_post.metadata->>'category' <> 'empregos'
     or v_post.metadata->>'categoryKey' <> 'empregos' then
    raise exception 'trigger did not synchronize opportunity category aliases: %', v_post.metadata;
  end if;
  if v_post.price <> 9000.00 then
    raise exception 'trigger did not derive opportunity remuneration price: %', v_post.price;
  end if;
end;
$$;

update public.posts
set
  module = 'eventos',
  category = null,
  metadata = jsonb_build_object(
    'categoryKey', 'Palestra',
    'categoriaKey', 'Palestra'
  ),
  price = null
where id = '00000000-0000-4000-8000-00000000cafe';

do $$
declare
  v_post public.posts%rowtype;
begin
  select * into strict v_post
  from public.posts
  where id = '00000000-0000-4000-8000-00000000cafe';

  if v_post.category <> 'palestras'
     or v_post.metadata->>'category' <> 'palestras'
     or v_post.metadata->>'categoryKey' <> 'palestras'
     or v_post.metadata->>'categoriaKey' <> 'palestras' then
    raise exception 'trigger lost metadata-only category: %', v_post.metadata;
  end if;
end;
$$;

delete from public.posts
where id = '00000000-0000-4000-8000-00000000cafe';

alter table public.posts enable trigger trg_anti_spam_gate;
