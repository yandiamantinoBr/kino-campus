-- Reconcile every audited published post whose six category identity
-- surfaces differ from the canonical module-scoped registry captured on
-- 2026-08-08. The data repair is UUID-bound and accepts only the exact audited
-- source fingerprint or the complete target fingerprint. Unknown category
-- pairs are never assigned a label from another module.

-- The local reset executor runs statements without an outer transaction,
-- while the linked deployment executor applies the file atomically. Session
-- settings work in both executors and are reset explicitly at the end.
set lock_timeout = '5s';
set statement_timeout = '60s';

-- Acquire the writer-serializing lock before replacing any persistent
-- function when the migration executor provides an outer transaction. Under
-- the reset executor this DO is its own transaction; the main routine
-- reacquires the same lock before it reads or writes posts.
do $migration_lock$
begin
  execute 'lock table public.posts in share row exclusive mode';
end;
$migration_lock$;

create or replace function public.kc_feed_category_key(
  p_module text,
  p_value text
)
returns text
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_module text := public.kc_feed_slug_key(p_module);
  v_key text := public.kc_feed_slug_key(p_value);
begin
  if v_key = '' then return ''; end if;

  if v_module = 'eventos' then
    return case v_key
      when 'academico' then 'academicos'
      when 'academica' then 'academicos'
      when 'academicas' then 'academicos'
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
      when 'monitorias' then 'monitoria'
      when 'curso-capacitacao' then 'cursos-capacitacoes'
      when 'curso-capacitacoes' then 'cursos-capacitacoes'
      when 'cursos-capacitacao' then 'cursos-capacitacoes'
      when 'curso-e-capacitacao' then 'cursos-capacitacoes'
      when 'cursos-e-capacitacoes' then 'cursos-capacitacoes'
      when 'voluntariados' then 'voluntariado'
      when 'freelancers' then 'freelancer'
      else v_key
    end;
  end if;

  if v_module = 'moradia' then
    return case v_key
      when 'republica' then 'republicas'
      when 'quarto' then 'quartos'
      when 'apartamento' then 'apartamentos'
      when 'casa' then 'casas'
      when 'procuro' then 'procurando'
      when 'procurando-moradia' then 'procurando'
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
      when 'achados' then 'encontrados'
      else v_key
    end;
  end if;

  return v_key;
end;
$function$;

comment on function public.kc_feed_category_key(text, text)
  is 'Maps the explicit create/publisher aliases to one canonical category key within the same feed module.';

create or replace function public.kc_feed_category_label(
  p_module text,
  p_category text
)
returns text
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_module text := public.kc_feed_slug_key(p_module);
  v_category text := public.kc_feed_category_key(p_module, p_category);
begin
  return case v_module
    when 'eventos' then case v_category
      when 'academicos' then 'Acadêmicos'
      when 'palestras' then 'Palestras'
      when 'congressos' then 'Congressos'
      when 'cursos' then 'Cursos'
      when 'culturais' then 'Culturais'
      when 'esportivos' then 'Esportivos'
      when 'workshops' then 'Workshops'
      when 'festas' then 'Festas'
      when 'sustentabilidade' then 'Sustentabilidade'
      else null
    end
    when 'oportunidades' then case v_category
      when 'editais' then 'Editais'
      when 'concursos' then 'Concursos'
      when 'bolsas' then 'Bolsas'
      when 'estagios' then 'Estágio'
      when 'empregos' then 'Emprego'
      when 'monitoria' then 'Monitoria'
      when 'pesquisa' then 'Pesquisa'
      when 'cursos-capacitacoes' then 'Cursos e capacitações'
      when 'voluntariado' then 'Voluntariado'
      when 'freelancer' then 'Freelancer'
      else null
    end
    when 'moradia' then case v_category
      when 'republicas' then 'Repúblicas'
      when 'quartos' then 'Quartos'
      when 'apartamentos' then 'Apartamentos'
      when 'casas' then 'Casas'
      when 'procurando' then 'Procurando'
      else null
    end
    when 'compra-venda' then case v_category
      when 'eletronicos' then 'Eletrônicos'
      when 'livros' then 'Livros'
      when 'ingressos' then 'Ingressos'
      when 'moveis' then 'Móveis'
      when 'vestuario' then 'Vestuário'
      when 'outros' then 'Outros'
      else null
    end
    when 'caronas' then case v_category
      when 'ofereco' then 'Ofereço carona'
      when 'procuro' then 'Procuro carona'
      else null
    end
    when 'achados-perdidos' then case v_category
      when 'perdidos' then 'Perdidos'
      when 'encontrados' then 'Encontrados'
      else null
    end
    else null
  end;
end;
$function$;

comment on function public.kc_feed_category_label(text, text)
  is 'Returns the canonical display label for one valid module/category pair; unknown and cross-module pairs return NULL.';

-- Keep the existing trigger contract, adding module-scoped labels and avoiding
-- an unrelated price derivation when UPDATE changes category aliases only.
create or replace function public.kc_canonicalize_post_feed_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_meta jsonb;
  v_module text;
  v_category text;
  v_old_category text;
  v_category_label text;
  v_pair_changed boolean;
  v_surface_changed boolean;
  v_price numeric;
  v_price_input_changed boolean;
begin
  if new.metadata is null then
    v_meta := '{}'::jsonb;
  elsif pg_catalog.jsonb_typeof(new.metadata) <> 'object' then
    raise exception 'posts.metadata must be a JSON object'
      using errcode = '22023';
  else
    v_meta := new.metadata;
  end if;

  v_module := public.kc_feed_slug_key(new.module);
  v_category := public.kc_feed_category_key(
    new.module,
    coalesce(
      nullif(pg_catalog.btrim(coalesce(new.category, '')), ''),
      nullif(pg_catalog.btrim(coalesce(v_meta->>'categoryKey', '')), ''),
      nullif(pg_catalog.btrim(coalesce(v_meta->>'category', '')), ''),
      nullif(pg_catalog.btrim(coalesce(v_meta->>'categoriaKey', '')), '')
    )
  );

  if tg_op = 'INSERT' then
    v_old_category := null;
    v_pair_changed := true;
    v_surface_changed := true;
  else
    v_old_category := public.kc_feed_category_key(
      old.module,
      coalesce(
        nullif(pg_catalog.btrim(coalesce(old.category, '')), ''),
        nullif(pg_catalog.btrim(coalesce(old.metadata->>'categoryKey', '')), ''),
        nullif(pg_catalog.btrim(coalesce(old.metadata->>'category', '')), ''),
        nullif(pg_catalog.btrim(coalesce(old.metadata->>'categoriaKey', '')), '')
      )
    );
    v_pair_changed :=
      v_module is distinct from public.kc_feed_slug_key(old.module)
      or v_category is distinct from v_old_category;
    v_surface_changed :=
      v_meta->'category' is distinct from old.metadata->'category'
      or v_meta->'categoryKey' is distinct from old.metadata->'categoryKey'
      or v_meta->'categoriaKey' is distinct from old.metadata->'categoriaKey'
      or v_meta->'categoryLabel' is distinct from old.metadata->'categoryLabel'
      or v_meta->'categoria' is distinct from old.metadata->'categoria'
      or v_meta->'categoriaLabel' is distinct from old.metadata->'categoriaLabel';
  end if;

  if v_category <> '' then
    v_category_label := public.kc_feed_category_label(new.module, v_category);
    if v_category_label is null then
      if v_pair_changed or v_surface_changed then
        raise exception using
          errcode = '22023',
          message = pg_catalog.format(
            'unknown canonical category pair for posts: module=%s category=%s',
            coalesce(new.module, '<null>'),
            v_category
          );
      end if;
      -- Unrelated updates on a stable legacy pair must not legitimize or
      -- mechanically rewrite any historical taxonomy surface.
    else
      new.module := v_module;
      new.category := v_category;
      v_meta := pg_catalog.jsonb_set(v_meta, '{category}', pg_catalog.to_jsonb(v_category), true);
      v_meta := pg_catalog.jsonb_set(v_meta, '{categoryKey}', pg_catalog.to_jsonb(v_category), true);
      v_meta := pg_catalog.jsonb_set(v_meta, '{categoriaKey}', pg_catalog.to_jsonb(v_category), true);
      v_meta := pg_catalog.jsonb_set(v_meta, '{categoryLabel}', pg_catalog.to_jsonb(v_category_label), true);
      v_meta := pg_catalog.jsonb_set(v_meta, '{categoria}', pg_catalog.to_jsonb(v_category_label), true);
      v_meta := pg_catalog.jsonb_set(v_meta, '{categoriaLabel}', pg_catalog.to_jsonb(v_category_label), true);
    end if;
  elsif (v_pair_changed or v_surface_changed) and v_module in (
    'eventos', 'oportunidades', 'moradia', 'compra-venda', 'caronas', 'achados-perdidos'
  ) then
    raise exception using
      errcode = '22023',
      message = pg_catalog.format(
        'missing canonical category for posts module=%s',
        coalesce(new.module, '<null>')
      );
  end if;

  if v_module = 'caronas' then
    if v_meta ? 'caronasFeatureKeys'
       and (
         tg_op = 'INSERT'
         or v_module is distinct from public.kc_feed_slug_key(old.module)
         or v_meta->'caronasFeatureKeys' is distinct from old.metadata->'caronasFeatureKeys'
       ) then
      v_meta := pg_catalog.jsonb_set(
        v_meta,
        '{caronasFeatureKeys}',
        public.kc_feed_ride_feature_json(v_meta->'caronasFeatureKeys'),
        true
      );
    end if;
    if v_meta ? 'tagKeys'
       and (
         tg_op = 'INSERT'
         or v_module is distinct from public.kc_feed_slug_key(old.module)
         or v_meta->'tagKeys' is distinct from old.metadata->'tagKeys'
       ) then
      v_meta := pg_catalog.jsonb_set(
        v_meta,
        '{tagKeys}',
        public.kc_feed_ride_feature_json(v_meta->'tagKeys'),
        true
      );
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_price_input_changed := true;
  else
    v_price_input_changed :=
      v_module is distinct from public.kc_feed_slug_key(old.module)
      or new.price is distinct from old.price
      or (
        v_module = 'oportunidades'
        and v_meta->>'remuneracao' is distinct from old.metadata->>'remuneracao'
      )
      or (
        v_module = 'caronas'
        and v_meta->>'contribuicao' is distinct from old.metadata->>'contribuicao'
      );
  end if;

  if new.price is null
     and v_price_input_changed
     and v_module in ('oportunidades', 'caronas') then
    v_price := public.kc_feed_parse_numeric_text(case
      when v_module = 'oportunidades' then v_meta->>'remuneracao'
      else v_meta->>'contribuicao'
    end);
    if v_price is not null and v_price >= 0 then
      new.price := v_price;
    end if;
  end if;

  new.metadata := v_meta;
  return new;
end;
$function$;

comment on function public.kc_canonicalize_post_feed_fields()
  is 'Canonicalizes module-scoped category keys and labels, ride feature aliases and explicitly changed numeric price inputs before persistence.';

-- Verify the persistent registry independently from the audited data subset.
do $registry_guard$
declare
  v_pairs bigint;
  v_matching bigint;
begin
  with registry(module, category, label) as (
    values
      ('eventos','academicos','Acadêmicos'), ('eventos','palestras','Palestras'),
      ('eventos','congressos','Congressos'), ('eventos','cursos','Cursos'),
      ('eventos','culturais','Culturais'), ('eventos','esportivos','Esportivos'),
      ('eventos','workshops','Workshops'), ('eventos','festas','Festas'),
      ('eventos','sustentabilidade','Sustentabilidade'),
      ('oportunidades','editais','Editais'), ('oportunidades','concursos','Concursos'),
      ('oportunidades','bolsas','Bolsas'), ('oportunidades','estagios','Estágio'),
      ('oportunidades','empregos','Emprego'), ('oportunidades','monitoria','Monitoria'),
      ('oportunidades','pesquisa','Pesquisa'),
      ('oportunidades','cursos-capacitacoes','Cursos e capacitações'),
      ('oportunidades','voluntariado','Voluntariado'),
      ('oportunidades','freelancer','Freelancer'),
      ('moradia','republicas','Repúblicas'), ('moradia','quartos','Quartos'),
      ('moradia','apartamentos','Apartamentos'), ('moradia','casas','Casas'),
      ('moradia','procurando','Procurando'),
      ('compra-venda','eletronicos','Eletrônicos'), ('compra-venda','livros','Livros'),
      ('compra-venda','ingressos','Ingressos'), ('compra-venda','moveis','Móveis'),
      ('compra-venda','vestuario','Vestuário'), ('compra-venda','outros','Outros'),
      ('caronas','ofereco','Ofereço carona'), ('caronas','procuro','Procuro carona'),
      ('achados-perdidos','perdidos','Perdidos'),
      ('achados-perdidos','encontrados','Encontrados')
  )
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where public.kc_feed_category_label(module, category) = label
    )
  into v_pairs, v_matching
  from registry;

  if (v_pairs = 34 and v_matching = 34) is not true
     or public.kc_feed_category_label('eventos', 'empregos') is not null
     or public.kc_feed_category_label('oportunidades', 'academicos') is not null
     or public.kc_feed_category_label('unknown-module', 'academicos') is not null then
    raise exception using
      errcode = 'KL001',
      message = pg_catalog.format(
        'canonical category label registry failed: pairs=%s matching=%s',
        v_pairs,
        v_matching
      );
  end if;
end;
$registry_guard$;

drop table if exists pg_temp.kc_category_label_reconciliation_20260808;
drop table if exists pg_temp.kc_category_label_snapshot_20260808;

create temporary table kc_category_label_reconciliation_20260808 (
  id uuid primary key,
  expected_module text not null,
  expected_category text not null,
  expected_label text not null,
  expected_status text not null default 'published',
  expected_visibility text not null default 'public',
  expected_price numeric default 0,
  source_variant text not null check (
    source_variant in (
      'standard_without_category',
      'standard_with_category',
      'missing_category_and_category_label',
      'with_category_without_category_label',
      'legacy_bolsa_partial'
    )
  ),
  source_category_label text,
  source_categoria text not null,
  source_touched_fingerprint jsonb,
  target_touched_fingerprint jsonb
) on commit drop;

create temporary table kc_category_label_snapshot_20260808 (
  id uuid primary key,
  row_except_metadata_updated_at jsonb not null,
  untouched_metadata jsonb not null,
  updated_at timestamptz,
  was_source boolean not null
) on commit drop;

create or replace function pg_temp.kc_category_surface_fingerprint_20260808(
  p_metadata jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'category', pg_catalog.jsonb_build_object(
      'present', p_metadata ? 'category', 'value', p_metadata->'category'
    ),
    'categoryKey', pg_catalog.jsonb_build_object(
      'present', p_metadata ? 'categoryKey', 'value', p_metadata->'categoryKey'
    ),
    'categoriaKey', pg_catalog.jsonb_build_object(
      'present', p_metadata ? 'categoriaKey', 'value', p_metadata->'categoriaKey'
    ),
    'categoryLabel', pg_catalog.jsonb_build_object(
      'present', p_metadata ? 'categoryLabel', 'value', p_metadata->'categoryLabel'
    ),
    'categoria', pg_catalog.jsonb_build_object(
      'present', p_metadata ? 'categoria', 'value', p_metadata->'categoria'
    ),
    'categoriaLabel', pg_catalog.jsonb_build_object(
      'present', p_metadata ? 'categoriaLabel', 'value', p_metadata->'categoriaLabel'
    )
  );
$function$;

create or replace function pg_temp.kc_expected_category_surface_20260808(
  p_category text,
  p_label text
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'category', pg_catalog.jsonb_build_object(
      'present', true, 'value', pg_catalog.to_jsonb(p_category)
    ),
    'categoryKey', pg_catalog.jsonb_build_object(
      'present', true, 'value', pg_catalog.to_jsonb(p_category)
    ),
    'categoriaKey', pg_catalog.jsonb_build_object(
      'present', true, 'value', pg_catalog.to_jsonb(p_category)
    ),
    'categoryLabel', pg_catalog.jsonb_build_object(
      'present', true, 'value', pg_catalog.to_jsonb(p_label)
    ),
    'categoria', pg_catalog.jsonb_build_object(
      'present', true, 'value', pg_catalog.to_jsonb(p_label)
    ),
    'categoriaLabel', pg_catalog.jsonb_build_object(
      'present', true, 'value', pg_catalog.to_jsonb(p_label)
    )
  );
$function$;

create or replace function pg_temp.kc_source_category_surface_20260808(
  p_variant text,
  p_category text,
  p_category_label text,
  p_categoria text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
begin
  if p_variant in (
    'standard_without_category',
    'standard_with_category',
    'missing_category_and_category_label',
    'with_category_without_category_label'
  ) then
    if p_variant in ('standard_without_category', 'standard_with_category')
       and p_category_label is null then
      raise exception using
        errcode = 'KL002',
        message = 'standard category label source requires a categoryLabel';
    end if;

    return pg_catalog.jsonb_build_object(
      'category', pg_catalog.jsonb_build_object(
        'present', p_variant in (
          'standard_with_category',
          'with_category_without_category_label'
        ),
        'value', case
          when p_variant in (
            'standard_with_category',
            'with_category_without_category_label'
          ) then pg_catalog.to_jsonb(p_category)
          else 'null'::jsonb
        end
      ),
      'categoryKey', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(p_category)
      ),
      'categoriaKey', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(p_category)
      ),
      'categoryLabel', pg_catalog.jsonb_build_object(
        'present', p_variant in (
          'standard_without_category',
          'standard_with_category'
        ),
        'value', case
          when p_variant in (
            'standard_without_category',
            'standard_with_category'
          ) then pg_catalog.to_jsonb(p_category_label)
          else 'null'::jsonb
        end
      ),
      'categoria', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(p_categoria)
      ),
      'categoriaLabel', pg_catalog.jsonb_build_object(
        'present', false, 'value', 'null'::jsonb
      )
    );
  end if;

  if p_variant = 'legacy_bolsa_partial' then
    return pg_catalog.jsonb_build_object(
      'category', pg_catalog.jsonb_build_object(
        'present', false, 'value', 'null'::jsonb
      ),
      'categoryKey', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(p_category)
      ),
      'categoriaKey', pg_catalog.jsonb_build_object(
        'present', false, 'value', 'null'::jsonb
      ),
      'categoryLabel', pg_catalog.jsonb_build_object(
        'present', false, 'value', 'null'::jsonb
      ),
      'categoria', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(p_categoria)
      ),
      'categoriaLabel', pg_catalog.jsonb_build_object(
        'present', false, 'value', 'null'::jsonb
      )
    );
  end if;

  raise exception using
    errcode = 'KL003',
    message = pg_catalog.format('unknown category label source variant: %s', p_variant);
end;
$function$;

-- Each INSERT below binds a homogeneous audited source fingerprint to its full
-- UUIDs. Grouping removes duplicated literals without permitting fuzzy or
-- category-wide updates: the repair still joins only by the 87 listed UUIDs.
insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'eventos', 'academicos', 'Acadêmicos',
       'standard_with_category', 'Academicos', 'Academicos'
from pg_catalog.unnest(array[
  '4addd028-22ac-42c9-8688-015e9779da3f'::uuid,
  'fcd0f0b1-3093-49a0-8339-e8ba34b4114c'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'eventos', 'academicos', 'Acadêmicos',
       'standard_without_category', 'Academicos', 'Academicos'
from pg_catalog.unnest(array[
  '018a96bf-1505-48fb-a6d7-3e3f26ea148e'::uuid,
  '01d7b015-ab92-4b3d-8e4d-4e88f32fe180'::uuid,
  '07ef7b16-8257-49e8-b8cf-bd6db2f9ef38'::uuid,
  '3d500db4-bb75-4f09-ac0b-a9d0ec6123a4'::uuid,
  '56746645-0aba-4806-97f7-49b739b73772'::uuid,
  '60649e01-5ef5-405e-90b5-a595e9216738'::uuid,
  '6643b77a-81c7-4354-86be-2e5eda0ecd6a'::uuid,
  'a2be25d1-da54-4ee8-a6d3-fe6de9769011'::uuid,
  'dbfdf0cb-55f7-46ad-85ce-12cad27b3d12'::uuid,
  'dc5c09a9-df84-4062-a698-4042145bf07f'::uuid,
  'fac8d6ca-d66a-49d3-8356-9b208af22f75'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
values
  (
    '12550854-3a1a-4a39-b08c-d57e1cc7d8a7'::uuid,
    'eventos', 'academicos', 'Acadêmicos',
    'standard_without_category', 'Acadêmicos', 'Acadêmicos'
  ),
  (
    '0cf1c2f6-5e65-4d02-8345-7aa82dc40a11'::uuid,
    'eventos', 'academicos', 'Acadêmicos',
    'standard_without_category', 'Pesquisa', 'Acadêmicos'
  ),
  (
    '6a43f20c-0b8b-472d-b43c-daa8c6b8cb38'::uuid,
    'eventos', 'congressos', 'Congressos',
    'standard_without_category', 'Academicos', 'Congressos'
  ),
  (
    '4150a6ca-9d5e-4522-98a9-973952893cc7'::uuid,
    'eventos', 'congressos', 'Congressos',
    'standard_without_category', 'Pesquisa', 'Congressos'
  );

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'eventos', 'congressos', 'Congressos',
       'standard_without_category', 'Congressos', 'Congressos'
from pg_catalog.unnest(array[
  '68a0bbbc-e2ac-4792-b160-b7577a750d1b'::uuid,
  '92f20472-ec25-42b0-94b8-0b56d6255058'::uuid,
  'ee31c240-f962-482f-a8e4-3a550c43a2f6'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'eventos', 'culturais', 'Culturais',
       'standard_with_category', 'Culturais', 'Culturais'
from pg_catalog.unnest(array[
  '2c0f70aa-8948-4335-bc57-66cfc86e2254'::uuid,
  '7bebc99a-8f12-4b55-b928-40c6c44bae24'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'eventos', 'culturais', 'Culturais',
       'standard_without_category', 'Culturais', 'Culturais'
from pg_catalog.unnest(array[
  '447659fe-0787-4d79-bb04-8d038d56896f'::uuid,
  '5485a5ae-ca68-4e31-bfbe-7908045faf42'::uuid,
  '5bfacd9c-2991-4264-a265-31763bc4b341'::uuid,
  '87195842-a086-4614-811d-406ad62d8f84'::uuid,
  '88dda63f-fe66-4553-9794-d732e2a93139'::uuid,
  'b4aca32f-814d-4116-b396-2f30afad1494'::uuid,
  'e3c9c66f-85f5-4dac-aff2-ab91e70c564b'::uuid,
  'e85ee2a3-535a-4483-b87c-c45cfdc7ba90'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
values
  (
    '013df393-91c2-42a3-9508-b838558a0ee1'::uuid,
    'eventos', 'esportivos', 'Esportivos',
    'standard_without_category', 'Esportivos', 'Esportivos'
  ),
  (
    '270d6932-5c04-4b15-8a60-c3340ad0a1b9'::uuid,
    'eventos', 'palestras', 'Palestras',
    'standard_without_category', 'Academico', 'Palestras'
  ),
  (
    '45d5076e-23d9-490c-965d-03f1135e42ed'::uuid,
    'eventos', 'palestras', 'Palestras',
    'standard_without_category', 'Academico', 'Palestras'
  ),
  (
    '543c3dd3-d247-4830-b659-280fd8836757'::uuid,
    'eventos', 'palestras', 'Palestras',
    'standard_without_category', 'Pesquisa', 'Palestras'
  ),
  (
    'ac615cda-89e1-47fd-a1bf-74199e0fc5bf'::uuid,
    'eventos', 'palestras', 'Palestras',
    'standard_without_category', 'Pesquisa', 'Palestras'
  ),
  (
    'fdd48cde-1c6e-4faa-973c-00e02d3d7e75'::uuid,
    'eventos', 'workshops', 'Workshops',
    'standard_without_category', 'Academicos', 'Workshops'
  );

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'eventos', 'workshops', 'Workshops',
       'standard_without_category', 'Workshops', 'Workshops'
from pg_catalog.unnest(array[
  '59a15d62-5a15-46b0-9408-b7c28b4ae823'::uuid,
  '908393bb-c838-4266-940c-78dd79a1222e'::uuid,
  'cb991ae6-3ca3-4183-b34e-3655ae1c4f15'::uuid,
  'd7e177a2-b48e-441f-adb3-ab4b4c7a17df'::uuid
]) ids(id);

-- The Passe Livre row remains an open editorial-review item. This structural
-- source state mirrors its existing oportunidades/bolsas root only; it does
-- not reclassify the row or close the editorial decision.
insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
values (
  '4b39baaf-996b-49ca-a603-b122066946dd'::uuid,
  'oportunidades', 'bolsas', 'Bolsas',
  'legacy_bolsa_partial', null, 'Bolsas'
);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'oportunidades', 'bolsas', 'Bolsas',
       'standard_without_category', 'Bolsas', 'Bolsas'
from pg_catalog.unnest(array[
  '17d7d6ec-a70d-4ab1-ae04-847d9b0a43dd'::uuid,
  '4f83362b-1af6-4b24-a521-0f242421b64e'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
values
  (
    '7a3e040a-72cb-443f-803c-aa1749b0d738'::uuid,
    'oportunidades', 'bolsas', 'Bolsas',
    'standard_without_category', 'Pesquisa', 'Bolsas'
  ),
  (
    '168c9cbc-10a4-43a4-8b56-c9c1fb5176e2'::uuid,
    'oportunidades', 'concursos', 'Concursos',
    'standard_without_category', 'Academicos', 'Concursos'
  ),
  (
    '2569361d-d799-463c-88af-2fb0a7f6bb90'::uuid,
    'oportunidades', 'concursos', 'Concursos',
    'standard_without_category', 'Emprego', 'Concursos'
  );

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações',
       'standard_without_category', 'Cursos e capacitações', 'Cursos e capacitações'
from pg_catalog.unnest(array[
  '0ac23479-325c-428f-80d7-28431217bbde'::uuid,
  '403a9ed3-c194-4e2d-ba39-7686526be73c'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
values
  (
    '0e920527-0806-46f9-876f-24559a4562b9'::uuid,
    'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações',
    'standard_without_category', 'Workshops', 'Cursos e capacitações'
  ),
  (
    'b4ac0d24-4711-4758-948f-5e33e1fb1b29'::uuid,
    'oportunidades', 'editais', 'Editais',
    'standard_without_category', 'Editais', 'Editais'
  ),
  (
    'd826a3be-ef42-4d04-8862-1bec56eb697b'::uuid,
    'oportunidades', 'empregos', 'Emprego',
    'standard_without_category', 'Empregos', 'Empregos'
  ),
  (
    '583893a9-a333-4a14-8ecc-7796d10dcf45'::uuid,
    'oportunidades', 'monitoria', 'Monitoria',
    'standard_with_category', 'Academicos', 'Monitoria'
  );

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'oportunidades', 'pesquisa', 'Pesquisa',
       'standard_with_category', 'Pesquisa', 'Pesquisa'
from pg_catalog.unnest(array[
  '380404b0-8180-459c-bfb1-80812d42df1a'::uuid,
  '680de838-2a14-49d5-b1aa-9cb09f0f64ce'::uuid,
  '7364a8a1-2fff-48f7-9f0c-4c9871f90a7f'::uuid
]) ids(id);

insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  source_variant, source_category_label, source_categoria
)
select id, 'oportunidades', 'pesquisa', 'Pesquisa',
       'standard_without_category', 'Pesquisa', 'Pesquisa'
from pg_catalog.unnest(array[
  '0a57fc77-9ab2-4d25-a4a4-f7203c9a1359'::uuid,
  '0ec31a60-b8fb-4711-a921-3e951e942023'::uuid,
  '2d4d26b3-65c9-46d5-aced-66ec1ab182c8'::uuid,
  '31bbc912-570a-446a-a5aa-015141a42411'::uuid,
  '39cd5662-a46b-42e3-b8de-64142d5b70bd'::uuid,
  '3b8d248c-f1db-45cb-adb5-cca9b49a90d9'::uuid,
  '587af1e0-e3f8-4ffc-a4a0-bd3d1a715337'::uuid,
  '614b3721-8676-447c-8f7c-cf7e60e6c3ff'::uuid,
  '6198c272-e882-4f12-b19a-912e99ff1bf1'::uuid,
  '70f02616-1131-4b16-b4a9-380139582ec1'::uuid,
  '7f6f688b-34f1-4912-b0f5-05a4dec65609'::uuid,
  '80b3ee37-d36c-4e09-af3b-9a897f4b5a6e'::uuid,
  '871e4c3b-417d-401c-90a1-94ffacc172f7'::uuid,
  '8a2ffc7d-9460-4686-acf8-865dac1db619'::uuid,
  'a0e39686-a85e-4363-a945-f03e313b338d'::uuid,
  'a22262e7-794b-4f75-966a-7f65434eb530'::uuid,
  'a773eceb-be43-43b1-88db-4ee38f98343c'::uuid,
  'ae78b207-f589-4ce8-941a-58a819c47303'::uuid,
  'af92b968-3198-43b6-8247-c4b507c5d150'::uuid,
  'b5ec0206-a634-4c32-b937-09145a78eb3f'::uuid,
  'bfb875e4-62d8-4f11-a2f3-78a1b5657f14'::uuid,
  'cc13f596-231f-4a8d-b8fc-1466e407b19d'::uuid,
  'cdb9da59-eb5f-4344-99e0-e7b5b1fd2305'::uuid,
  'ceb74ea0-c8e5-4598-8e20-fabf43a48ef5'::uuid,
  'e2374c2d-53ef-4b48-a9c1-5518a06fcdc4'::uuid,
  'e46c28f6-9605-4873-b904-ebd72442df07'::uuid,
  'f237d121-a585-459f-824c-9af3a06a7094'::uuid,
  'f2ff9855-77ae-40f3-bb7b-44140b0ac7ef'::uuid,
  'fe26e460-5155-42de-b66f-e3785e25038c'::uuid
]) ids(id);

-- Three published/community rows complete the invariant across every
-- published visibility, rather than only the public feed surface.
insert into pg_temp.kc_category_label_reconciliation_20260808 (
  id, expected_module, expected_category, expected_label,
  expected_visibility,
  source_variant, source_category_label, source_categoria
)
values
  (
    '55008a05-3d79-5fbd-8aa2-666e2a0b71ff'::uuid,
    'oportunidades', 'cursos-capacitacoes', 'Cursos e capacitações',
    'community',
    'standard_without_category', 'Cursos e capacitações', 'Cursos e capacitações'
  ),
  (
    '9d8b952f-c44b-5a66-804e-fdc4dd1be80e'::uuid,
    'oportunidades', 'editais', 'Editais',
    'community',
    'missing_category_and_category_label', null, 'Editais'
  ),
  (
    'ffd27f1a-91ba-5295-848c-eb940113d72c'::uuid,
    'oportunidades', 'pesquisa', 'Pesquisa',
    'community',
    'with_category_without_category_label', null, 'oportunidades'
  );

-- Freeze the non-zero and NULL prices observed read-only; every other audited
-- UUID has exact price 0. These updates affect only the temporary specification.
update pg_temp.kc_category_label_reconciliation_20260808
set expected_price = null
where id in (
  '0cf1c2f6-5e65-4d02-8345-7aa82dc40a11'::uuid,
  '2d4d26b3-65c9-46d5-aced-66ec1ab182c8'::uuid,
  '403a9ed3-c194-4e2d-ba39-7686526be73c'::uuid,
  '587af1e0-e3f8-4ffc-a4a0-bd3d1a715337'::uuid,
  '80b3ee37-d36c-4e09-af3b-9a897f4b5a6e'::uuid,
  '8a2ffc7d-9460-4686-acf8-865dac1db619'::uuid,
  'b4ac0d24-4711-4758-948f-5e33e1fb1b29'::uuid,
  'e2374c2d-53ef-4b48-a9c1-5518a06fcdc4'::uuid,
  'e46c28f6-9605-4873-b904-ebd72442df07'::uuid
);

update pg_temp.kc_category_label_reconciliation_20260808
set expected_price = 300
where id = '0ac23479-325c-428f-80d7-28431217bbde'::uuid;

update pg_temp.kc_category_label_reconciliation_20260808
set expected_price = 13671.34
where id = '2569361d-d799-463c-88af-2fb0a7f6bb90'::uuid;

update pg_temp.kc_category_label_reconciliation_20260808
set
  source_touched_fingerprint = pg_temp.kc_source_category_surface_20260808(
    source_variant,
    expected_category,
    source_category_label,
    source_categoria
  ),
  target_touched_fingerprint = pg_temp.kc_expected_category_surface_20260808(
    expected_category,
    expected_label
  );

alter table pg_temp.kc_category_label_reconciliation_20260808
  alter column source_touched_fingerprint set not null,
  alter column target_touched_fingerprint set not null;

create or replace function pg_temp.kc_assert_category_label_triggers_20260808()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_trigger_name text;
  v_enabled "char";
begin
  for v_trigger_name in
    select trigger_name
    from pg_catalog.unnest(array[
      'kc_active_session_write_guard',
      'kc_posts_set_updated_at',
      'trg_posts_canonicalize_feed_fields'
    ]::text[]) trigger_name
    order by trigger_name
  loop
    select trigger_row.tgenabled
    into v_enabled
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
      and trigger_row.tgname = v_trigger_name
      and trigger_row.tgisinternal is false;

    if not found or v_enabled <> 'O' then
      raise exception using
        errcode = 'KL006',
        message = pg_catalog.format(
          'category label reconciliation aborted: required origin trigger %s is absent or not O',
          v_trigger_name
        );
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    cross join lateral (
      select pg_catalog.array_agg(attribute_row.attname order by attribute_row.attname) as columns
      from pg_catalog.pg_attribute attribute_row
      where attribute_row.attrelid = trigger_row.tgrelid
        and attribute_row.attnum = any(trigger_row.tgattr)
    ) trigger_columns
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.posts')
      and trigger_row.tgname = 'trg_posts_canonicalize_feed_fields'
      and trigger_row.tgisinternal is false
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgfoid =
        pg_catalog.to_regprocedure('public.kc_canonicalize_post_feed_fields()')
      and trigger_row.tgqual is null
      -- BEFORE (2) + ROW (1) + INSERT (4) + UPDATE (16).
      and trigger_row.tgtype = 23
      and trigger_columns.columns = array[
        'category', 'metadata', 'module', 'price'
      ]::name[]
  ) then
    raise exception using
      errcode = 'KL006',
      message = 'category label reconciliation aborted: canonical trigger definition drifted';
  end if;
end;
$function$;

create or replace function pg_temp.kc_run_category_label_reconciliation_20260808()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_spec_rows bigint;
  v_registry_rows bigint;
  v_price_rows bigint;
  v_locked_rows bigint := 0;
  v_source_rows bigint := 0;
  v_published_rows bigint;
  v_registry_published_rows bigint;
  v_admissible_published_rows bigint;
  v_global_drift_rows bigint;
  v_updated_rows bigint;
  v_preserved_rows bigint;
  v_target_rows bigint;
  v_timestamp_rows bigint;
  v_post record;
  v_fingerprint jsonb;
  v_is_source boolean;
  v_is_target boolean;
begin
  -- In reset/standalone execution this statement transaction owns the lock;
  -- under the linked executor it reasserts the lock acquired above.
  execute 'lock table public.posts in share row exclusive mode';

  select pg_catalog.count(*)
  into v_spec_rows
  from pg_temp.kc_category_label_reconciliation_20260808;

  if (v_spec_rows = 87) is not true then
    raise exception using
      errcode = 'KL004',
      message = pg_catalog.format(
        'category label reconciliation aborted: expected 87 UUID specifications, found %s',
        v_spec_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_registry_rows
  from pg_temp.kc_category_label_reconciliation_20260808 spec
  where spec.expected_status = 'published'
    and spec.expected_visibility in ('public', 'community')
    and public.kc_feed_category_key(
      spec.expected_module,
      spec.expected_category
    ) = spec.expected_category
    and public.kc_feed_category_label(
      spec.expected_module,
      spec.expected_category
    ) = spec.expected_label
    and spec.target_touched_fingerprint =
      pg_temp.kc_expected_category_surface_20260808(
        spec.expected_category,
        spec.expected_label
      )
    and spec.source_touched_fingerprint <> spec.target_touched_fingerprint;

  if (v_registry_rows = v_spec_rows) is not true then
    raise exception using
      errcode = 'KL005',
      message = pg_catalog.format(
        'category label reconciliation aborted: registry/spec agreement is %s of %s',
        v_registry_rows,
        v_spec_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_price_rows
  from pg_temp.kc_category_label_reconciliation_20260808
  where expected_price = 0;

  if (v_price_rows = 76) is not true
     or (
       select pg_catalog.count(*)
       from pg_temp.kc_category_label_reconciliation_20260808
       where expected_price is null
     ) <> 9
     or (
       select pg_catalog.count(*)
       from pg_temp.kc_category_label_reconciliation_20260808
       where id = '0ac23479-325c-428f-80d7-28431217bbde'::uuid
         and expected_price = 300
     ) <> 1
     or (
       select pg_catalog.count(*)
       from pg_temp.kc_category_label_reconciliation_20260808
       where id = '2569361d-d799-463c-88af-2fb0a7f6bb90'::uuid
         and expected_price = 13671.34
     ) <> 1 then
    raise exception using
      errcode = 'KL005',
      message = 'category label reconciliation aborted: audited price distribution drifted';
  end if;

  perform pg_temp.kc_assert_category_label_triggers_20260808();

  -- Empty reset/preview databases install the registry and trigger behavior but
  -- have no production UUIDs to reconcile.
  if not exists (select 1 from public.posts) then
    return;
  end if;

  -- Deterministic ordering avoids deadlocks. Every one of the 87 rows is locked
  -- and validated before the first UPDATE against public.posts.
  for v_post in
    select
      p.id,
      p.module,
      p.category,
      p.status,
      p.visibility,
      p.price,
      p.metadata,
      spec.expected_module,
      spec.expected_category,
      spec.expected_status,
      spec.expected_visibility,
      spec.expected_price,
      spec.source_touched_fingerprint,
      spec.target_touched_fingerprint
    from public.posts p
    join pg_temp.kc_category_label_reconciliation_20260808 spec
      on spec.id = p.id
    order by p.id
    for update of p
  loop
    v_locked_rows := v_locked_rows + 1;

    if (
      v_post.module = v_post.expected_module
      and v_post.category = v_post.expected_category
      and v_post.status = v_post.expected_status
      and v_post.visibility = v_post.expected_visibility
      and v_post.price is not distinct from v_post.expected_price
    ) is not true then
      raise exception using
        errcode = 'KL008',
        message = pg_catalog.format(
          'category label reconciliation aborted: base identity drift for post %s',
          v_post.id
        );
    end if;

    if (pg_catalog.jsonb_typeof(v_post.metadata) = 'object') is not true then
      raise exception using
        errcode = 'KL008',
        message = pg_catalog.format(
          'category label reconciliation aborted: metadata is not an object for post %s',
          v_post.id
        );
    end if;

    v_fingerprint := pg_temp.kc_category_surface_fingerprint_20260808(
      v_post.metadata
    );
    v_is_source := v_fingerprint = v_post.source_touched_fingerprint;
    v_is_target := v_fingerprint = v_post.target_touched_fingerprint;

    if (v_is_source or v_is_target) is not true then
      raise exception using
        errcode = 'KL009',
        message = pg_catalog.format(
          'category label reconciliation aborted: unexpected six-surface state for post %s',
          v_post.id
        );
    end if;

    if v_is_source then
      v_source_rows := v_source_rows + 1;
    end if;
  end loop;

  if (v_locked_rows = v_spec_rows) is not true then
    raise exception using
      errcode = 'KL007',
      message = pg_catalog.format(
        'category label reconciliation aborted: locked %s of %s audited UUIDs',
        v_locked_rows,
        v_spec_rows
      );
  end if;

  -- Validate the full published denominator after the 87 UUIDs have produced
  -- their dedicated KL007/KL008/KL009 diagnostics, but still before the first
  -- write. The top-level table lock keeps all 134 rows stable throughout.
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where p.module = public.kc_feed_slug_key(p.module)
        and p.category = public.kc_feed_category_key(p.module, p.category)
        and public.kc_feed_category_label(p.module, p.category) is not null
    ),
    pg_catalog.count(*) filter (
      where pg_catalog.jsonb_typeof(p.metadata) = 'object'
        and case
          when spec.id is not null then
            p.module = spec.expected_module
            and p.category = spec.expected_category
            and p.status = spec.expected_status
            and p.visibility = spec.expected_visibility
            and p.price is not distinct from spec.expected_price
          else
            p.module = public.kc_feed_slug_key(p.module)
            and p.category = public.kc_feed_category_key(p.module, p.category)
            and public.kc_feed_category_label(p.module, p.category) is not null
            and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
              pg_temp.kc_expected_category_surface_20260808(
                p.category,
                public.kc_feed_category_label(p.module, p.category)
              )
        end
    )
  into
    v_published_rows,
    v_registry_published_rows,
    v_admissible_published_rows
  from public.posts p
  left join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = p.id
  where p.status = 'published';

  if (
    v_published_rows = 134
    and v_registry_published_rows = 134
    and v_admissible_published_rows = 134
  ) is not true then
    raise exception using
      errcode = 'KL014',
      message = pg_catalog.format(
        'category label reconciliation aborted: published preflight total=%s registry=%s admissible=%s, expected 134/134/134',
        v_published_rows,
        v_registry_published_rows,
        v_admissible_published_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_global_drift_rows
  from public.posts p
  where p.status = 'published'
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) <>
      pg_temp.kc_expected_category_surface_20260808(
        p.category,
        public.kc_feed_category_label(p.module, p.category)
      );

  if (v_global_drift_rows = v_source_rows) is not true then
    raise exception using
      errcode = 'KL016',
      message = pg_catalog.format(
        'category label reconciliation aborted: global drift=%s differs from audited source rows=%s',
        v_global_drift_rows,
        v_source_rows
      );
  end if;

  truncate table pg_temp.kc_category_label_snapshot_20260808;
  insert into pg_temp.kc_category_label_snapshot_20260808 (
    id,
    row_except_metadata_updated_at,
    untouched_metadata,
    updated_at,
    was_source
  )
  select
    p.id,
    pg_catalog.to_jsonb(p) - array['metadata', 'updated_at']::text[],
    p.metadata - array[
      'category', 'categoryKey', 'categoriaKey',
      'categoryLabel', 'categoria', 'categoriaLabel'
    ]::text[],
    p.updated_at,
    pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      spec.source_touched_fingerprint
  from public.posts p
  join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = p.id;

  update public.posts p
  set metadata = p.metadata || pg_catalog.jsonb_build_object(
    'category', spec.expected_category,
    'categoryKey', spec.expected_category,
    'categoriaKey', spec.expected_category,
    'categoryLabel', spec.expected_label,
    'categoria', spec.expected_label,
    'categoriaLabel', spec.expected_label
  )
  from pg_temp.kc_category_label_reconciliation_20260808 spec
  where p.id = spec.id
    and p.module = spec.expected_module
    and p.category = spec.expected_category
    and p.status = spec.expected_status
    and p.visibility = spec.expected_visibility
    and p.price is not distinct from spec.expected_price
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      spec.source_touched_fingerprint;

  get diagnostics v_updated_rows = row_count;

  if (v_updated_rows = v_source_rows) is not true then
    raise exception using
      errcode = 'KL010',
      message = pg_catalog.format(
        'category label reconciliation failed update cardinality: expected %s writes, got %s',
        v_source_rows,
        v_updated_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_preserved_rows
  from public.posts p
  join pg_temp.kc_category_label_snapshot_20260808 snapshot
    on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) - array['metadata', 'updated_at']::text[] =
      snapshot.row_except_metadata_updated_at
    and p.metadata - array[
      'category', 'categoryKey', 'categoriaKey',
      'categoryLabel', 'categoria', 'categoriaLabel'
    ]::text[] = snapshot.untouched_metadata;

  if (v_preserved_rows = v_spec_rows) is not true then
    raise exception using
      errcode = 'KL011',
      message = pg_catalog.format(
        'category label reconciliation changed protected row data: preserved %s of %s',
        v_preserved_rows,
        v_spec_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_target_rows
  from public.posts p
  join pg_temp.kc_category_label_reconciliation_20260808 spec
    on spec.id = p.id
  where p.module = spec.expected_module
    and p.category = spec.expected_category
    and p.status = spec.expected_status
    and p.visibility = spec.expected_visibility
    and p.price is not distinct from spec.expected_price
    and pg_catalog.jsonb_typeof(p.metadata) = 'object'
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      spec.target_touched_fingerprint;

  if (v_target_rows = v_spec_rows) is not true then
    raise exception using
      errcode = 'KL012',
      message = pg_catalog.format(
        'category label reconciliation failed target postcondition: found %s of %s',
        v_target_rows,
        v_spec_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_admissible_published_rows
  from public.posts p
  where p.status = 'published'
    and p.module = public.kc_feed_slug_key(p.module)
    and p.category = public.kc_feed_category_key(p.module, p.category)
    and public.kc_feed_category_label(p.module, p.category) is not null
    and pg_catalog.jsonb_typeof(p.metadata) = 'object'
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      pg_temp.kc_expected_category_surface_20260808(
        p.category,
        public.kc_feed_category_label(p.module, p.category)
      );

  if (v_admissible_published_rows = 134) is not true then
    raise exception using
      errcode = 'KL015',
      message = pg_catalog.format(
        'category label reconciliation failed global published postcondition: exact=%s expected=134',
        v_admissible_published_rows
      );
  end if;

  select pg_catalog.count(*)
  into v_timestamp_rows
  from public.posts p
  join pg_temp.kc_category_label_snapshot_20260808 snapshot
    on snapshot.id = p.id
  where (
      snapshot.was_source
      and p.updated_at is distinct from snapshot.updated_at
    ) or (
      not snapshot.was_source
      and p.updated_at is not distinct from snapshot.updated_at
    );

  if (v_timestamp_rows = v_spec_rows) is not true then
    raise exception using
      errcode = 'KL013',
      message = pg_catalog.format(
        'category label reconciliation violated updated_at semantics for %s of %s rows',
        v_spec_rows - v_timestamp_rows,
        v_spec_rows
      );
  end if;

  perform pg_temp.kc_assert_category_label_triggers_20260808();
end;
$function$;

-- The only data-changing statement against public.posts. All 87 rows have
-- already been locked and validated inside the call before its UPDATE executes.
select pg_temp.kc_run_category_label_reconciliation_20260808();

reset statement_timeout;
reset lock_timeout;
