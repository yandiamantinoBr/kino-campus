-- Canonicalize mechanical feed taxonomy aliases at the database boundary.
-- Semantic reclassification remains explicit by post UUID in a later migration.

create or replace function public.kc_feed_category_key(
  p_module text,
  p_value text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_module text := public.kc_feed_slug_key(p_module);
  v_key text := public.kc_feed_slug_key(p_value);
begin
  if v_key = '' then return ''; end if;

  if v_module = 'eventos' then
    return case v_key
      when 'academico' then 'academicos'
      when 'academica' then 'academicos'
      when 'palestra' then 'palestras'
      when 'congresso' then 'congressos'
      when 'curso' then 'cursos'
      when 'cultural' then 'culturais'
      when 'esportivo' then 'esportivos'
      when 'workshop' then 'workshops'
      when 'festa' then 'festas'
      else v_key
    end;
  end if;

  if v_module = 'oportunidades' then
    return case v_key
      when 'edital' then 'editais'
      when 'concurso' then 'concursos'
      when 'bolsa' then 'bolsas'
      when 'estagio' then 'estagios'
      when 'emprego' then 'empregos'
      when 'curso-capacitacao' then 'cursos-capacitacoes'
      else v_key
    end;
  end if;

  if v_module = 'moradia' then
    return case v_key
      when 'republica' then 'republicas'
      when 'quarto' then 'quartos'
      when 'apartamento' then 'apartamentos'
      when 'casa' then 'casas'
      else v_key
    end;
  end if;

  if v_module = 'compra-venda' then
    return case v_key
      when 'eletronico' then 'eletronicos'
      when 'livro' then 'livros'
      when 'ingresso' then 'ingressos'
      when 'movel' then 'moveis'
      when 'outro' then 'outros'
      else v_key
    end;
  end if;

  if v_module = 'caronas' then
    return case v_key
      when 'ofereco-carona' then 'ofereco'
      when 'procuro-carona' then 'procuro'
      else v_key
    end;
  end if;

  if v_module = 'achados-perdidos' then
    return case v_key
      when 'perdido' then 'perdidos'
      when 'encontrado' then 'encontrados'
      when 'achado' then 'encontrados'
      else v_key
    end;
  end if;

  return v_key;
end;
$$;

create or replace function public.kc_feed_ride_feature_key(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select case public.kc_feed_slug_key(p_value)
    when '4-mais-lugares' then 'quatro-mais-lugares'
    when 'quatro-ou-mais-lugares' then 'quatro-mais-lugares'
    when 'nao-fumantes' then 'sem-fumar'
    when 'nao-fumar' then 'sem-fumar'
    when 'apenas-mulheres' then 'somente-mulheres'
    else public.kc_feed_slug_key(p_value)
  end;
$$;

create or replace function public.kc_feed_ride_feature_json(p_value jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_value is null or jsonb_typeof(p_value) <> 'array' then coalesce(p_value, '[]'::jsonb)
    else coalesce((
      select jsonb_agg(feature_key order by first_position)
      from (
        select
          public.kc_feed_ride_feature_key(entry.value) as feature_key,
          min(entry.ordinality) as first_position
        from jsonb_array_elements_text(p_value) with ordinality as entry(value, ordinality)
        group by public.kc_feed_ride_feature_key(entry.value)
      ) normalized
      where feature_key <> ''
    ), '[]'::jsonb)
  end;
$$;

create or replace function public.kc_feed_market_category_key(p_value text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text := public.kc_feed_slug_key(p_value);
begin
  if v_key = '' then return ''; end if;
  if v_key like '%eletron%' then return 'eletronicos'; end if;
  if v_key like '%livr%' then return 'livros'; end if;
  if v_key like '%ingress%' then return 'ingressos'; end if;
  if v_key like '%mov%' or v_key like '%mobil%' then return 'moveis'; end if;
  if v_key like '%vest%' or v_key like '%roup%' then return 'vestuario'; end if;
  if v_key like '%outro%' then return 'outros'; end if;
  return v_key;
end;
$$;

create or replace function public.kc_feed_opportunity_type_key(p_value text, p_haystack text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text := public.kc_feed_slug_key(p_value);
  v_haystack text := public.kc_feed_normalize_text(p_haystack);
begin
  if position('edital' in v_key) > 0 or position('chamada' in v_key) > 0 then return 'edital'; end if;
  if position('concurso' in v_key) > 0 then return 'concurso'; end if;
  if position('bolsa' in v_key) > 0 then return 'bolsa'; end if;
  if position('curso' in v_key) > 0 and position('capacit' in v_key) > 0 then return 'curso-capacitacao'; end if;
  if position('estag' in v_key) > 0 then return 'estagio'; end if;
  if position('empreg' in v_key) > 0 then return 'emprego'; end if;
  if position('freela' in v_key) > 0 then return 'freelancer'; end if;
  if position('monitor' in v_key) > 0 then return 'monitoria'; end if;
  if position('pesquis' in v_key) > 0 then return 'pesquisa'; end if;
  if position('volunt' in v_key) > 0 then return 'voluntariado'; end if;

  if position('concurso' in v_haystack) > 0 then return 'concurso'; end if;
  if position('edital' in v_haystack) > 0 or position('chamada publica' in v_haystack) > 0 then return 'edital'; end if;
  if position('bolsa' in v_haystack) > 0 then return 'bolsa'; end if;
  if position('curso' in v_haystack) > 0 or position('capacit' in v_haystack) > 0 then return 'curso-capacitacao'; end if;
  if position('freelancer' in v_haystack) > 0 or position('freela' in v_haystack) > 0 then return 'freelancer'; end if;
  if position('monitoria' in v_haystack) > 0 or position('monitor ' in v_haystack) > 0 then return 'monitoria'; end if;
  if position('volunt' in v_haystack) > 0 then return 'voluntariado'; end if;
  if position('estagio' in v_haystack) > 0 or position('trainee' in v_haystack) > 0 then return 'estagio'; end if;
  if position('emprego' in v_haystack) > 0 or position('clt' in v_haystack) > 0 or position('vaga' in v_haystack) > 0 then return 'emprego'; end if;
  if position('pesquis' in v_haystack) > 0 then return 'pesquisa'; end if;
  return v_key;
end;
$$;

create or replace function public.kc_canonicalize_post_feed_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_meta jsonb;
  v_category text;
  v_price numeric;
begin
  if new.metadata is null then
    v_meta := '{}'::jsonb;
  elsif jsonb_typeof(new.metadata) <> 'object' then
    raise exception 'posts.metadata must be a JSON object'
      using errcode = '22023';
  else
    v_meta := new.metadata;
  end if;

  v_category := public.kc_feed_category_key(
    new.module,
    coalesce(
      nullif(btrim(coalesce(new.category, '')), ''),
      nullif(btrim(coalesce(v_meta->>'categoryKey', '')), ''),
      nullif(btrim(coalesce(v_meta->>'category', '')), ''),
      nullif(btrim(coalesce(v_meta->>'categoriaKey', '')), '')
    )
  );
  if v_category <> '' then
    new.category := v_category;
    v_meta := jsonb_set(v_meta, '{categoryKey}', to_jsonb(v_category), true);
    v_meta := jsonb_set(v_meta, '{category}', to_jsonb(v_category), true);
    v_meta := jsonb_set(v_meta, '{categoriaKey}', to_jsonb(v_category), true);
  end if;

  if public.kc_feed_slug_key(new.module) = 'caronas' then
    if v_meta ? 'caronasFeatureKeys' then
      v_meta := jsonb_set(v_meta, '{caronasFeatureKeys}', public.kc_feed_ride_feature_json(v_meta->'caronasFeatureKeys'), true);
    end if;
    if v_meta ? 'tagKeys' then
      v_meta := jsonb_set(v_meta, '{tagKeys}', public.kc_feed_ride_feature_json(v_meta->'tagKeys'), true);
    end if;
  end if;

  if new.price is null and public.kc_feed_slug_key(new.module) in ('oportunidades', 'caronas') then
    v_price := public.kc_feed_parse_numeric_text(case
      when public.kc_feed_slug_key(new.module) = 'oportunidades' then v_meta->>'remuneracao'
      else v_meta->>'contribuicao'
    end);
    if v_price is not null and v_price >= 0 then
      new.price := v_price;
    end if;
  end if;

  new.metadata := v_meta;
  return new;
end;
$$;

drop trigger if exists trg_posts_canonicalize_feed_fields on public.posts;
create trigger trg_posts_canonicalize_feed_fields
before insert or update of module, category, metadata, price on public.posts
for each row execute function public.kc_canonicalize_post_feed_fields();

do $$
begin
  if exists (
    select 1
    from public.posts
    where metadata is null or jsonb_typeof(metadata) <> 'object'
  ) then
    raise exception 'feed taxonomy migration requires object-shaped posts.metadata';
  end if;
end;
$$;

-- Backfill only mechanical aliases and values derivable without editorial judgment.
update public.posts
set
  category = public.kc_feed_category_key(module, category),
  metadata = metadata
where
  category is distinct from public.kc_feed_category_key(module, category)
  or (
    coalesce(metadata->>'category', '') <> ''
    and metadata->>'category' is distinct from public.kc_feed_category_key(module, metadata->>'category')
  )
  or (
    coalesce(metadata->>'categoryKey', '') <> ''
    and metadata->>'categoryKey' is distinct from public.kc_feed_category_key(module, metadata->>'categoryKey')
  )
  or (
    coalesce(metadata->>'categoriaKey', '') <> ''
    and metadata->>'categoriaKey' is distinct from public.kc_feed_category_key(module, metadata->>'categoriaKey')
  )
  or (
    public.kc_feed_slug_key(module) = 'caronas'
    and (
      coalesce(metadata->'caronasFeatureKeys', '[]'::jsonb) is distinct from public.kc_feed_ride_feature_json(metadata->'caronasFeatureKeys')
      or coalesce(metadata->'tagKeys', '[]'::jsonb) is distinct from public.kc_feed_ride_feature_json(metadata->'tagKeys')
    )
  )
  or (
    price is null
    and public.kc_feed_slug_key(module) in ('oportunidades', 'caronas')
    and public.kc_feed_parse_numeric_text(case
      when public.kc_feed_slug_key(module) = 'oportunidades' then metadata->>'remuneracao'
      else metadata->>'contribuicao'
    end) is not null
  );

comment on function public.kc_feed_category_key(text, text)
  is 'Maps mechanical legacy aliases to the canonical category key for each feed module.';
comment on function public.kc_canonicalize_post_feed_fields()
  is 'Canonicalizes feed category, ride feature aliases and numeric contribution/remuneration before persistence.';
