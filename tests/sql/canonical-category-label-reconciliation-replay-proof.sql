\set ON_ERROR_STOP on

-- Local-only proof. The dedicated runner requires an empty local posts table,
-- expands migration includes in memory and verifies this outer rollback.
begin;

do $guard$
declare
  v_posts bigint;
  v_triggers bigint;
begin
  select pg_catalog.count(*) into v_posts from public.posts;
  if (v_posts = 0) is not true then
    raise exception using
      errcode = 'KP001',
      message = pg_catalog.format(
        'category label replay proof requires an empty local posts table, found %s',
        v_posts
      );
  end if;

  if pg_catalog.current_setting('session_replication_role') <> 'origin' then
    raise exception using
      errcode = 'KP002',
      message = 'category label replay proof requires origin trigger mode';
  end if;

  select pg_catalog.count(*)
  into v_triggers
  from pg_catalog.pg_trigger
  where tgrelid = 'public.posts'::regclass
    and tgname in (
      'kc_active_session_write_guard',
      'kc_posts_set_updated_at',
      'trg_posts_canonicalize_feed_fields'
    )
    and tgenabled = 'O';

  if (v_triggers = 3) is not true then
    raise exception using
      errcode = 'KP003',
      message = pg_catalog.format(
        'category label replay proof requires three origin triggers, found %s',
        v_triggers
      );
  end if;
end;
$guard$;

-- Empty reset/preview replay installs the persistent registry and trigger
-- behavior without requiring production UUIDs.
\ir ../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql

do $alias_matrix$
declare
  v_aliases bigint;
  v_matches bigint;
begin
  with aliases(module, alias, category, label) as (
    values
      ('eventos','academico','academicos','Acadêmicos'),
      ('eventos','academica','academicos','Acadêmicos'),
      ('eventos','academicas','academicos','Acadêmicos'),
      ('eventos','palestra','palestras','Palestras'),
      ('eventos','congresso','congressos','Congressos'),
      ('eventos','curso','cursos','Cursos'),
      ('eventos','cultural','culturais','Culturais'),
      ('eventos','esportivo','esportivos','Esportivos'),
      ('eventos','workshop','workshops','Workshops'),
      ('eventos','festa','festas','Festas'),
      ('oportunidades','edital','editais','Editais'),
      ('oportunidades','concurso','concursos','Concursos'),
      ('oportunidades','bolsa','bolsas','Bolsas'),
      ('oportunidades','estagio','estagios','Estágio'),
      ('oportunidades','emprego','empregos','Emprego'),
      ('oportunidades','monitorias','monitoria','Monitoria'),
      ('oportunidades','curso-capacitacao','cursos-capacitacoes','Cursos e capacitações'),
      ('oportunidades','curso-capacitacoes','cursos-capacitacoes','Cursos e capacitações'),
      ('oportunidades','cursos-capacitacao','cursos-capacitacoes','Cursos e capacitações'),
      ('oportunidades','curso e capacitacao','cursos-capacitacoes','Cursos e capacitações'),
      ('oportunidades','cursos e capacitações','cursos-capacitacoes','Cursos e capacitações'),
      ('oportunidades','voluntariados','voluntariado','Voluntariado'),
      ('oportunidades','freelancers','freelancer','Freelancer'),
      ('moradia','republica','republicas','Repúblicas'),
      ('moradia','quarto','quartos','Quartos'),
      ('moradia','apartamento','apartamentos','Apartamentos'),
      ('moradia','casa','casas','Casas'),
      ('moradia','procuro','procurando','Procurando'),
      ('moradia','procurando-moradia','procurando','Procurando'),
      ('compra-venda','eletronico','eletronicos','Eletrônicos'),
      ('compra-venda','livro','livros','Livros'),
      ('compra-venda','ingresso','ingressos','Ingressos'),
      ('compra-venda','movel','moveis','Móveis'),
      ('compra-venda','outro','outros','Outros'),
      ('caronas','ofereço carona','ofereco','Ofereço carona'),
      ('caronas','procuro carona','procuro','Procuro carona'),
      ('achados-perdidos','perdido','perdidos','Perdidos'),
      ('achados-perdidos','encontrado','encontrados','Encontrados'),
      ('achados-perdidos','achado','encontrados','Encontrados'),
      ('achados-perdidos','achados','encontrados','Encontrados')
  )
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (
      where public.kc_feed_category_key(module, alias) = category
        and public.kc_feed_category_label(module, alias) = label
    )
  into v_aliases, v_matches
  from aliases;

  if (v_aliases = 40 and v_matches = 40) is not true then
    raise exception using
      errcode = 'KP010',
      message = pg_catalog.format(
        'category alias matrix matched %s of %s explicit aliases',
        v_matches,
        v_aliases
      );
  end if;

  if public.kc_feed_category_label('eventos', 'empregos') is not null
     or public.kc_feed_category_label('oportunidades', 'academicos') is not null
     or public.kc_feed_category_label('livros', 'livros') is not null then
    raise exception using
      errcode = 'KP011',
      message = 'category label registry accepted an unknown or cross-module pair';
  end if;
end;
$alias_matrix$;

-- Exercise trigger compatibility before the 87-row replay. Synthetic source
-- rows are inserted in local replica mode only; all behavior under test runs in
-- origin mode with the canonical trigger enabled.
set local session_replication_role = replica;
insert into public.posts (
  id, title, module, category, status, visibility, price, metadata,
  created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-00000000a001'::uuid,
    'legacy unknown pair fixture', 'eventos', 'evento', 'hidden', 'public', 0,
    '{"category":"evento-metadata","categoryKey":"evento-key","categoriaKey":"evento-pt-key","categoryLabel":"Evento legado","categoria":"Evento legado divergente","categoriaLabel":"Evento legado auxiliar","tags":["keep","keep"],"tagKeys":["keep","keep"]}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-00000000a002'::uuid,
    'metadata-only null price fixture', 'oportunidades', 'pesquisa', 'hidden', 'public', null,
    '{"categoryKey":"pesquisa","categoriaKey":"pesquisa","categoryLabel":"Pesquisa","categoria":"Pesquisa","remuneracao":"999.99","tags":["Pesquisa","independente"],"tagKeys":["pesquisa","independente"],"secondary":{"keep":true}}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-00000000a003'::uuid,
    'module transition price fixture', 'eventos', 'palestras', 'hidden', 'public', null,
    '{"category":"palestras","categoryKey":"palestras","categoriaKey":"palestras","categoryLabel":"Palestras","categoria":"Palestras","categoriaLabel":"Palestras","remuneracao":"700.50"}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-00000000a004'::uuid,
    'ride preservation fixture', 'caronas', 'ofereco', 'hidden', 'public', null,
    '{"categoryKey":"ofereco","categoriaKey":"ofereco","categoryLabel":"Ofereço carona","categoria":"Ofereço carona","contribuicao":"12.50","caronasFeatureKeys":["4-mais-lugares","quatro-mais-lugares"],"tagKeys":["4-mais-lugares","4-mais-lugares"],"tags":["independente","independente"]}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-00000000a007'::uuid,
    'legacy missing category fixture', 'eventos', '', 'hidden', 'public', 0,
    '{"categoryLabel":"Missing-root label","categoria":"Missing-root legacy","categoriaLabel":"Missing-root auxiliary","independent":{"keep":true}}'::jsonb,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  );
set local session_replication_role = origin;

create temporary table kc_trigger_fixture_before_20260808 as
select id, price, metadata
from public.posts
where id in (
  '00000000-0000-4000-8000-00000000a001'::uuid,
  '00000000-0000-4000-8000-00000000a002'::uuid,
  '00000000-0000-4000-8000-00000000a004'::uuid,
  '00000000-0000-4000-8000-00000000a007'::uuid
);

update public.posts
set metadata = pg_catalog.jsonb_set(metadata, '{unrelated}', 'true'::jsonb, true)
where id in (
  '00000000-0000-4000-8000-00000000a001'::uuid,
  '00000000-0000-4000-8000-00000000a002'::uuid,
  '00000000-0000-4000-8000-00000000a004'::uuid,
  '00000000-0000-4000-8000-00000000a007'::uuid
);

do $legacy_and_independent_update_assertion$
declare
  v_legacy public.posts%rowtype;
  v_opportunity public.posts%rowtype;
  v_ride public.posts%rowtype;
  v_missing public.posts%rowtype;
  v_before jsonb;
begin
  select * into strict v_legacy from public.posts
  where id = '00000000-0000-4000-8000-00000000a001'::uuid;
  if v_legacy.module <> 'eventos'
     or v_legacy.category <> 'evento'
     or v_legacy.metadata->>'categoryLabel' <> 'Evento legado'
     or v_legacy.metadata->>'categoria' <> 'Evento legado divergente'
     or v_legacy.metadata->>'categoriaLabel' <> 'Evento legado auxiliar' then
    raise exception using
      errcode = 'KP020',
      message = 'unchanged legacy unknown pair was blocked or semantically rewritten';
  end if;

  select metadata into strict v_before from pg_temp.kc_trigger_fixture_before_20260808
  where id = v_legacy.id;
  if v_legacy.metadata - 'unrelated' is distinct from v_before then
    raise exception using
      errcode = 'KP028',
      message = 'unrelated legacy update did not preserve all six taxonomy surfaces byte-for-byte';
  end if;

  select * into strict v_opportunity from public.posts
  where id = '00000000-0000-4000-8000-00000000a002'::uuid;
  select metadata into strict v_before from pg_temp.kc_trigger_fixture_before_20260808
  where id = v_opportunity.id;
  if v_opportunity.module <> 'oportunidades'
     or v_opportunity.price is not null
     or v_opportunity.metadata - array[
       'category','categoryLabel','categoria','categoriaLabel','unrelated'
     ]::text[] is distinct from v_before - array[
       'category','categoryLabel','categoria','categoriaLabel'
     ]::text[] then
    raise exception using
      errcode = 'KP021',
      message = 'metadata-only label synchronization changed price or independent opportunity metadata';
  end if;

  select * into strict v_ride from public.posts
  where id = '00000000-0000-4000-8000-00000000a004'::uuid;
  select metadata into strict v_before from pg_temp.kc_trigger_fixture_before_20260808
  where id = v_ride.id;
  if v_ride.price is not null
     or v_ride.metadata->'caronasFeatureKeys' is distinct from v_before->'caronasFeatureKeys'
     or v_ride.metadata->'tagKeys' is distinct from v_before->'tagKeys'
     or v_ride.metadata->'tags' is distinct from v_before->'tags' then
    raise exception using
      errcode = 'KP022',
      message = 'metadata-only ride label synchronization changed price or independent arrays';
  end if;

  select * into strict v_missing from public.posts
  where id = '00000000-0000-4000-8000-00000000a007'::uuid;
  select metadata into strict v_before from pg_temp.kc_trigger_fixture_before_20260808
  where id = v_missing.id;
  if v_missing.category <> ''
     or v_missing.metadata - 'unrelated' is distinct from v_before then
    raise exception using
      errcode = 'KP029',
      message = 'unrelated update rewrote a legacy missing-category row';
  end if;
end;
$legacy_and_independent_update_assertion$;

do $non_object_update_assertion$
declare
  v_before jsonb;
  v_after jsonb;
  v_message text;
begin
  select metadata into strict v_before
  from public.posts
  where id = '00000000-0000-4000-8000-00000000a002'::uuid;

  begin
    update public.posts
    set metadata = '[]'::jsonb
    where id = '00000000-0000-4000-8000-00000000a002'::uuid;
    raise exception using
      errcode = 'KP099',
      message = 'non-object metadata UPDATE was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'posts.metadata must be a JSON object' then
      raise exception using
        errcode = 'KP036',
        message = pg_catalog.format('unexpected non-object UPDATE error: %s', v_message);
    end if;
  end;

  select metadata into strict v_after
  from public.posts
  where id = '00000000-0000-4000-8000-00000000a002'::uuid;
  if v_after is distinct from v_before then
    raise exception using
      errcode = 'KP037',
      message = 'rejected non-object metadata UPDATE changed the row';
  end if;
end;
$non_object_update_assertion$;

-- An unchanged legacy root may receive unrelated edits, but its six category
-- surfaces cannot be used to persist a new arbitrary classification.
do $legacy_surface_mutation_assertion$
declare
  v_before jsonb;
  v_after jsonb;
  v_message text;
  v_surface text;
begin
  select metadata into strict v_before
  from public.posts
  where id = '00000000-0000-4000-8000-00000000a001'::uuid;

  foreach v_surface in array array[
    'category','categoryKey','categoriaKey',
    'categoryLabel','categoria','categoriaLabel'
  ] loop
    begin
      update public.posts
      set metadata = pg_catalog.jsonb_set(
        metadata,
        array[v_surface],
        pg_catalog.to_jsonb('arbitrary-' || v_surface),
        true
      )
      where id = '00000000-0000-4000-8000-00000000a001'::uuid;
      raise exception using
        errcode = 'KP099',
        message = pg_catalog.format(
          'unknown legacy %s surface mutation was accepted',
          v_surface
        );
    exception when sqlstate '22023' then
      get stacked diagnostics v_message = message_text;
      if v_message not like 'unknown canonical category pair for posts:%' then
        raise exception using
          errcode = 'KP026',
          message = pg_catalog.format(
            'unexpected legacy %s surface error: %s',
            v_surface,
            v_message
          );
      end if;
    end;

    select metadata into strict v_after
    from public.posts
    where id = '00000000-0000-4000-8000-00000000a001'::uuid;

    if v_after is distinct from v_before then
      raise exception using
        errcode = 'KP027',
        message = pg_catalog.format(
          'rejected legacy %s surface mutation changed the stored row',
          v_surface
        );
    end if;
  end loop;
end;
$legacy_surface_mutation_assertion$;

do $missing_category_surface_mutation_assertion$
declare
  v_before jsonb;
  v_after jsonb;
  v_message text;
  v_surface text;
begin
  select metadata into strict v_before
  from public.posts
  where id = '00000000-0000-4000-8000-00000000a007'::uuid;

  foreach v_surface in array array[
    'category','categoryKey','categoriaKey',
    'categoryLabel','categoria','categoriaLabel'
  ] loop
    begin
      update public.posts
      set metadata = pg_catalog.jsonb_set(
        metadata,
        array[v_surface],
        pg_catalog.to_jsonb('arbitrary-' || v_surface),
        true
      )
      where id = '00000000-0000-4000-8000-00000000a007'::uuid;
      raise exception using
        errcode = 'KP099',
        message = pg_catalog.format(
          'missing-category %s surface mutation was accepted',
          v_surface
        );
    exception when sqlstate '22023' then
      get stacked diagnostics v_message = message_text;
      if v_message not like 'unknown canonical category pair for posts:%'
         and v_message not like 'missing canonical category for posts module=%' then
        raise exception using
          errcode = 'KP033',
          message = pg_catalog.format(
            'unexpected missing-category %s error: %s',
            v_surface,
            v_message
          );
      end if;
    end;

    select metadata into strict v_after
    from public.posts
    where id = '00000000-0000-4000-8000-00000000a007'::uuid;

    if v_after is distinct from v_before then
      raise exception using
        errcode = 'KP034',
        message = pg_catalog.format(
          'rejected missing-category %s mutation changed the stored row',
          v_surface
        );
    end if;
  end loop;
end;
$missing_category_surface_mutation_assertion$;

-- Unknown legacy -> known is allowed and canonicalized; known -> unknown is a
-- changed pair and must fail closed without changing the row.
update public.posts
set category = 'palestra'
where id = '00000000-0000-4000-8000-00000000a001'::uuid;

update public.posts
set category = 'academica'
where id = '00000000-0000-4000-8000-00000000a007'::uuid;

do $known_transition_assertion$
declare
  v_post public.posts%rowtype;
  v_message text;
begin
  select * into strict v_post from public.posts
  where id = '00000000-0000-4000-8000-00000000a001'::uuid;
  if v_post.category <> 'palestras'
     or v_post.metadata->>'category' <> 'palestras'
     or v_post.metadata->>'categoryKey' <> 'palestras'
     or v_post.metadata->>'categoriaKey' <> 'palestras'
     or v_post.metadata->>'categoryLabel' <> 'Palestras'
     or v_post.metadata->>'categoria' <> 'Palestras'
     or v_post.metadata->>'categoriaLabel' <> 'Palestras' then
    raise exception using
      errcode = 'KP023',
      message = 'legacy unknown to known transition did not canonicalize all six surfaces';
  end if;

  select * into strict v_post from public.posts
  where id = '00000000-0000-4000-8000-00000000a007'::uuid;
  if v_post.category <> 'academicos'
     or v_post.metadata->>'category' <> 'academicos'
     or v_post.metadata->>'categoryKey' <> 'academicos'
     or v_post.metadata->>'categoriaKey' <> 'academicos'
     or v_post.metadata->>'categoryLabel' <> 'Acadêmicos'
     or v_post.metadata->>'categoria' <> 'Acadêmicos'
     or v_post.metadata->>'categoriaLabel' <> 'Acadêmicos' then
    raise exception using
      errcode = 'KP035',
      message = 'missing category to known transition did not canonicalize all six surfaces';
  end if;

  begin
    update public.posts
    set category = 'empregos'
    where id = '00000000-0000-4000-8000-00000000a001'::uuid;
    raise exception using
      errcode = 'KP099',
      message = 'known to cross-module transition was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_message = message_text;
    if v_message not like 'unknown canonical category pair for posts:%' then
      raise exception using
        errcode = 'KP024',
        message = pg_catalog.format('unexpected cross-module error: %s', v_message);
    end if;
  end;
end;
$known_transition_assertion$;

-- INSERT of an unknown pair must fail at the canonical trigger. Suspend only
-- the unrelated local anti-spam INSERT trigger for this transaction-scoped test.
alter table public.posts disable trigger trg_anti_spam_gate;
do $unknown_insert_assertion$
declare
  v_message text;
begin
  begin
    insert into public.posts (
      id, title, module, category, status, visibility, metadata
    ) values (
      '00000000-0000-4000-8000-00000000a005'::uuid,
      'unknown insert fixture', 'eventos', 'empregos', 'hidden', 'public', '{}'::jsonb
    );
    raise exception using
      errcode = 'KP099',
      message = 'unknown insert pair was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_message = message_text;
    if v_message not like 'unknown canonical category pair for posts:%' then
      raise exception using
        errcode = 'KP025',
        message = pg_catalog.format('unexpected unknown insert error: %s', v_message);
      end if;
  end;

  begin
    insert into public.posts (
      id, title, module, category, status, visibility, metadata
    ) values (
      '00000000-0000-4000-8000-00000000a008'::uuid,
      'non-object insert fixture', 'eventos', 'palestras', 'hidden', 'public', '[]'::jsonb
    );
    raise exception using
      errcode = 'KP099',
      message = 'non-object metadata INSERT was accepted';
  exception when sqlstate '22023' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'posts.metadata must be a JSON object' then
      raise exception using
        errcode = 'KP038',
        message = pg_catalog.format('unexpected non-object INSERT error: %s', v_message);
    end if;
  end;
end;
$unknown_insert_assertion$;

insert into public.posts (
  id, title, module, category, status, visibility, price, metadata
) values
  (
    '00000000-0000-4000-8000-00000000a006'::uuid,
    'known insert price fixture', 'oportunidades', 'emprego', 'hidden', 'public', null,
    '{"remuneracao":"900.25"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-00000000a009'::uuid,
    'module alias insert fixture', '  Eventos  ', 'palestra', 'hidden', 'public', null,
    '{}'::jsonb
  );
alter table public.posts enable trigger trg_anti_spam_gate;

update public.posts
set module = ' OPORTUNIDADES '
where id = '00000000-0000-4000-8000-00000000a002'::uuid;

update public.posts
set module = ' EVENTOS '
where id = '00000000-0000-4000-8000-00000000a009'::uuid;

update public.posts
set price = null
where id = '00000000-0000-4000-8000-00000000a006'::uuid;

update public.posts
set metadata = pg_catalog.jsonb_set(metadata, '{remuneracao}', '"1000.75"'::jsonb, true),
    price = null
where id = '00000000-0000-4000-8000-00000000a006'::uuid;

update public.posts
set module = 'oportunidades', category = 'emprego'
where id = '00000000-0000-4000-8000-00000000a003'::uuid;

update public.posts
set metadata = pg_catalog.jsonb_set(metadata, '{contribuicao}', '"15.50"'::jsonb, true)
where id = '00000000-0000-4000-8000-00000000a004'::uuid;

update public.posts
set metadata = metadata || pg_catalog.jsonb_build_object(
  'caronasFeatureKeys', pg_catalog.jsonb_build_array('4-mais-lugares', 'nao-fumantes'),
  'tagKeys', pg_catalog.jsonb_build_array(
    '4-mais-lugares', 'nao-fumantes', '4-mais-lugares'
  )
)
where id = '00000000-0000-4000-8000-00000000a004'::uuid;

do $price_and_ride_assertion$
declare
  v_insert public.posts%rowtype;
  v_transition public.posts%rowtype;
  v_ride public.posts%rowtype;
  v_alias public.posts%rowtype;
  v_casing_price public.posts%rowtype;
begin
  select * into strict v_insert from public.posts
  where id = '00000000-0000-4000-8000-00000000a006'::uuid;
  if v_insert.category <> 'empregos'
     or v_insert.price <> 1000.75
     or v_insert.metadata->>'categoryLabel' <> 'Emprego' then
    raise exception using
      errcode = 'KP030',
      message = 'insert/explicit-clear/remuneration price behavior regressed';
  end if;

  select * into strict v_transition from public.posts
  where id = '00000000-0000-4000-8000-00000000a003'::uuid;
  if v_transition.module <> 'oportunidades'
     or v_transition.category <> 'empregos'
     or v_transition.price <> 700.50
     or v_transition.metadata->>'categoryLabel' <> 'Emprego' then
    raise exception using
      errcode = 'KP031',
      message = 'module transition did not preserve canonical label/price inference';
  end if;

  select * into strict v_alias from public.posts
  where id = '00000000-0000-4000-8000-00000000a009'::uuid;
  if v_alias.module <> 'eventos'
     or v_alias.category <> 'palestras'
     or v_alias.price is not null
     or v_alias.metadata->>'category' <> 'palestras'
     or v_alias.metadata->>'categoryKey' <> 'palestras'
     or v_alias.metadata->>'categoriaKey' <> 'palestras'
     or v_alias.metadata->>'categoryLabel' <> 'Palestras'
     or v_alias.metadata->>'categoria' <> 'Palestras'
     or v_alias.metadata->>'categoriaLabel' <> 'Palestras' then
    raise exception using
      errcode = 'KP039',
      message = 'module/category alias did not reach its canonical fixed point';
  end if;

  select * into strict v_casing_price from public.posts
  where id = '00000000-0000-4000-8000-00000000a002'::uuid;
  if v_casing_price.module <> 'oportunidades'
     or v_casing_price.category <> 'pesquisa'
     or v_casing_price.price is not null
     or v_casing_price.metadata->>'remuneracao' <> '999.99' then
    raise exception using
      errcode = 'KP044',
      message = 'module casing canonicalization incorrectly derived opportunity price';
  end if;

  select * into strict v_ride from public.posts
  where id = '00000000-0000-4000-8000-00000000a004'::uuid;
  if v_ride.price <> 15.50
     or v_ride.metadata->'caronasFeatureKeys' <>
       '["quatro-mais-lugares","sem-fumar"]'::jsonb
     or v_ride.metadata->'tagKeys' <>
       '["quatro-mais-lugares","sem-fumar"]'::jsonb
     or v_ride.metadata->'tags' <> '["independente","independente"]'::jsonb then
    raise exception using
      errcode = 'KP032',
      message = pg_catalog.format(
        'explicit ride input change regressed: price=%s features=%s tagKeys=%s tags=%s',
        v_ride.price,
        v_ride.metadata->'caronasFeatureKeys',
        v_ride.metadata->'tagKeys',
        v_ride.metadata->'tags'
      );
  end if;
end;
$price_and_ride_assertion$;

set local session_replication_role = replica;
delete from public.posts
where id::text like '00000000-0000-4000-8000-00000000a0%';
set local session_replication_role = origin;

create or replace function pg_temp.kc_surface_metadata_20260808(
  p_fingerprint jsonb,
  p_untouched jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select coalesce(p_untouched, '{}'::jsonb) || coalesce((
    select pg_catalog.jsonb_object_agg(entry.key, entry.value->'value')
    from pg_catalog.jsonb_each(p_fingerprint) entry(key, value)
    where (entry.value->>'present')::boolean is true
  ), '{}'::jsonb);
$function$;

-- Materialize every exact audited source state from the migration-owned spec.
set local session_replication_role = replica;
insert into public.posts (
  id, title, module, category, status, visibility, price, metadata,
  created_at, updated_at
)
select
  spec.id,
  'category label source fixture ' || spec.id::text,
  spec.expected_module,
  spec.expected_category,
  spec.expected_status,
  spec.expected_visibility,
  spec.expected_price,
  pg_temp.kc_surface_metadata_20260808(
    spec.source_touched_fingerprint,
    pg_catalog.jsonb_build_object(
      'untouchedMarker', spec.id::text,
      'tags', pg_catalog.jsonb_build_array('keep', spec.expected_label, 'keep'),
      'tagKeys', pg_catalog.jsonb_build_array('keep', spec.expected_category, 'keep'),
      'secondary', pg_catalog.jsonb_build_object('keep', true),
      'dates', pg_catalog.jsonb_build_object('keep', '2026-08-08')
    ) || case
      when spec.expected_module = 'oportunidades' and spec.expected_price is null
        then pg_catalog.jsonb_build_object('remuneracao', '999.99')
      else '{}'::jsonb
    end
  ),
  '2026-01-01T00:00:00Z'::timestamptz,
  '2026-01-01T00:00:00Z'::timestamptz
from pg_temp.kc_category_label_reconciliation_20260808 spec;

-- The other 47 published rows were already canonical in the read-only audit.
-- Synthetic exact targets model that denominator and prove the table lock plus
-- global 134-row pre/postconditions without widening the UUID repair spec.
insert into public.posts (
  id, title, module, category, status, visibility, price, metadata,
  created_at, updated_at
)
select
  (
    '10000000-0000-4000-8000-' ||
    pg_catalog.lpad(series.value::text, 12, '0')
  )::uuid,
  'already canonical published fixture ' || series.value::text,
  'eventos',
  'academicos',
  'published',
  'public',
  0,
  pg_catalog.jsonb_build_object(
    'category', 'academicos',
    'categoryKey', 'academicos',
    'categoriaKey', 'academicos',
    'categoryLabel', 'Acadêmicos',
    'categoria', 'Acadêmicos',
    'categoriaLabel', 'Acadêmicos',
    'untouchedCanonicalMarker', series.value,
    'tags', pg_catalog.jsonb_build_array('keep', 'canonical')
  ),
  '2026-01-01T00:00:00Z'::timestamptz,
  '2026-01-01T00:00:00Z'::timestamptz
from pg_catalog.generate_series(1, 47) series(value);
set local session_replication_role = origin;

create temporary table kc_label_canonical_snapshot_20260808 as
select p.*
from public.posts p
where p.id::text like '10000000-0000-4000-8000-%';

create temporary table kc_label_source_snapshot_20260808 as
select
  p.id,
  pg_catalog.to_jsonb(p) - array['metadata', 'updated_at']::text[] as protected_row,
  p.metadata - array[
    'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
  ]::text[] as untouched_metadata,
  p.updated_at
from public.posts p
join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id;

\ir ../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql

do $source_target_assertion$
declare
  v_targets bigint;
  v_preserved bigint;
  v_timestamps bigint;
  v_canonical_unchanged bigint;
  v_global_exact bigint;
  v_disjoint_specs bigint;
begin
  select pg_catalog.count(*)
  into v_targets
  from public.posts p
  join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id
  where pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
    spec.target_touched_fingerprint;

  select pg_catalog.count(*)
  into v_preserved
  from public.posts p
  join pg_temp.kc_label_source_snapshot_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) - array['metadata','updated_at']::text[] = snapshot.protected_row
    and p.metadata - array[
      'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
    ]::text[] = snapshot.untouched_metadata;

  select pg_catalog.count(*)
  into v_timestamps
  from public.posts p
  join pg_temp.kc_label_source_snapshot_20260808 snapshot on snapshot.id = p.id
  where p.updated_at > snapshot.updated_at;

  select pg_catalog.count(*)
  into v_canonical_unchanged
  from public.posts p
  join pg_temp.kc_label_canonical_snapshot_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) = pg_catalog.to_jsonb(snapshot);

  select pg_catalog.count(*)
  into v_global_exact
  from public.posts p
  where p.status = 'published'
    and public.kc_feed_category_label(p.module, p.category) is not null
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      pg_temp.kc_expected_category_surface_20260808(
        p.category,
        public.kc_feed_category_label(p.module, p.category)
      );

  select pg_catalog.count(*)
  into v_disjoint_specs
  from pg_temp.kc_category_label_reconciliation_20260808 spec
  where spec.source_touched_fingerprint <> spec.target_touched_fingerprint;

  if (
    v_targets = 87
    and v_preserved = 87
    and v_timestamps = 87
    and v_canonical_unchanged = 47
    and v_global_exact = 134
    and v_disjoint_specs = 87
  ) is not true then
    raise exception using
      errcode = 'KP040',
      message = pg_catalog.format(
        'all-source replay failed: targets=%s preserved=%s timestamps=%s canonical=%s global=%s disjoint=%s',
        v_targets, v_preserved, v_timestamps, v_canonical_unchanged,
        v_global_exact, v_disjoint_specs
      );
  end if;

  if (
    select pg_catalog.count(*)
    from public.posts
    where price is null
  ) <> 9
     or (
       select price from public.posts
       where id = '0ac23479-325c-428f-80d7-28431217bbde'::uuid
     ) <> 300
     or (
       select price from public.posts
       where id = '2569361d-d799-463c-88af-2fb0a7f6bb90'::uuid
     ) <> 13671.34 then
    raise exception using
      errcode = 'KP041',
      message = 'all-source replay changed the audited price distribution';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = '4b39baaf-996b-49ca-a603-b122066946dd'::uuid
      and p.module = 'oportunidades'
      and p.category = 'bolsas'
      and p.status = 'published'
      and p.visibility = 'public'
      and p.price = 0
      and p.metadata->>'category' = 'bolsas'
      and p.metadata->>'categoryKey' = 'bolsas'
      and p.metadata->>'categoriaKey' = 'bolsas'
      and p.metadata->>'categoryLabel' = 'Bolsas'
      and p.metadata->>'categoria' = 'Bolsas'
      and p.metadata->>'categoriaLabel' = 'Bolsas'
  ) then
    raise exception using
      errcode = 'KP042',
      message = 'Passe Livre structural exception did not reach the six-surface target';
  end if;

  if (
    select pg_catalog.count(*)
    from public.posts p
    join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id
    where p.id in (
      '55008a05-3d79-5fbd-8aa2-666e2a0b71ff'::uuid,
      '9d8b952f-c44b-5a66-804e-fdc4dd1be80e'::uuid,
      'ffd27f1a-91ba-5295-848c-eb940113d72c'::uuid
    )
      and p.status = 'published'
      and p.visibility = 'community'
      and p.price = 0
      and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
        spec.target_touched_fingerprint
  ) <> 3 then
    raise exception using
      errcode = 'KP043',
      message = 'published/community structural rows did not reach exact targets';
  end if;
end;
$source_target_assertion$;

-- Rebuild the audited fixture as an exact 44-source/43-target mix. Replica
-- mode is local-only setup; the reconciliation itself always runs with origin
-- triggers and proves target rows are a timestamp-stable no-op.
set local session_replication_role = replica;
update public.posts p
set metadata = pg_temp.kc_surface_metadata_20260808(
      spec.source_touched_fingerprint,
      p.metadata - array[
        'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
      ]::text[]
    ),
    updated_at = '2026-02-01T00:00:00Z'::timestamptz
from pg_temp.kc_category_label_reconciliation_20260808 spec
where p.id = spec.id;

with ranked as (
  select
    spec.id,
    spec.target_touched_fingerprint,
    pg_catalog.row_number() over (order by spec.id) as row_number
  from pg_temp.kc_category_label_reconciliation_20260808 spec
)
update public.posts p
set metadata = pg_temp.kc_surface_metadata_20260808(
      ranked.target_touched_fingerprint,
      p.metadata - array[
        'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
      ]::text[]
    ),
    updated_at = '2026-03-01T00:00:00Z'::timestamptz
from ranked
where p.id = ranked.id
  and ranked.row_number % 2 = 0;
set local session_replication_role = origin;

create temporary table kc_label_mixed_snapshot_20260808 as
select
  p.id,
  pg_catalog.to_jsonb(p) - array['metadata','updated_at']::text[] as protected_row,
  p.metadata - array[
    'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
  ]::text[] as untouched_metadata,
  p.updated_at,
  pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
    spec.source_touched_fingerprint as was_source
from public.posts p
join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id;

do $mixed_precondition$
declare
  v_sources bigint;
  v_targets bigint;
begin
  select
    pg_catalog.count(*) filter (where was_source),
    pg_catalog.count(*) filter (where not was_source)
  into v_sources, v_targets
  from pg_temp.kc_label_mixed_snapshot_20260808;

  if (v_sources = 44 and v_targets = 43) is not true then
    raise exception using
      errcode = 'KP050',
      message = pg_catalog.format(
        'mixed replay fixture is not 44/43: sources=%s targets=%s',
        v_sources,
        v_targets
      );
  end if;
end;
$mixed_precondition$;

\ir ../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql

do $mixed_target_assertion$
declare
  v_targets bigint;
  v_preserved bigint;
  v_source_timestamps bigint;
  v_target_timestamps bigint;
begin
  select pg_catalog.count(*)
  into v_targets
  from public.posts p
  join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id
  where pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
    spec.target_touched_fingerprint;

  select pg_catalog.count(*)
  into v_preserved
  from public.posts p
  join pg_temp.kc_label_mixed_snapshot_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) - array['metadata','updated_at']::text[] = snapshot.protected_row
    and p.metadata - array[
      'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
    ]::text[] = snapshot.untouched_metadata;

  select
    pg_catalog.count(*) filter (
      where snapshot.was_source and p.updated_at > snapshot.updated_at
    ),
    pg_catalog.count(*) filter (
      where not snapshot.was_source
        and p.updated_at is not distinct from snapshot.updated_at
    )
  into v_source_timestamps, v_target_timestamps
  from public.posts p
  join pg_temp.kc_label_mixed_snapshot_20260808 snapshot on snapshot.id = p.id;

  if (
    v_targets = 87
    and v_preserved = 87
    and v_source_timestamps = 44
    and v_target_timestamps = 43
  ) is not true then
    raise exception using
      errcode = 'KP051',
      message = pg_catalog.format(
        'mixed replay failed: targets=%s preserved=%s source_ts=%s target_ts=%s',
        v_targets,
        v_preserved,
        v_source_timestamps,
        v_target_timestamps
      );
  end if;
end;
$mixed_target_assertion$;

-- Capture every target row, replay again, and require a byte-for-byte fixed
-- point including updated_at.
create temporary table kc_label_fixed_rows_20260808 as
select p.*
from public.posts p
join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id;

\ir ../../supabase/migrations/20260808225424_canonical_category_label_reconciliation.sql

do $fixed_point_assertion$
declare
  v_identical bigint;
begin
  select pg_catalog.count(*)
  into v_identical
  from public.posts p
  join pg_temp.kc_label_fixed_rows_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) = pg_catalog.to_jsonb(snapshot);

  if (v_identical = 87) is not true then
    raise exception using
      errcode = 'KP060',
      message = pg_catalog.format(
        'target replay was not a fixed point for %s of 87 rows',
        87 - v_identical
      );
  end if;
end;
$fixed_point_assertion$;

create or replace function pg_temp.kc_expect_label_failure_20260808(
  p_expected_state text,
  p_expected_message_like text,
  p_context text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_state text;
  v_message text;
begin
  begin
    perform pg_temp.kc_run_category_label_reconciliation_20260808();
    raise exception using
      errcode = 'KP099',
      message = pg_catalog.format('%s unexpectedly succeeded', p_context);
  exception when others then
    get stacked diagnostics
      v_state = returned_sqlstate,
      v_message = message_text;
    if v_state is distinct from p_expected_state then
      raise exception using
        errcode = 'KP080',
        message = pg_catalog.format(
          '%s expected SQLSTATE %s, got %s: %s',
          p_context,
          p_expected_state,
          v_state,
          v_message
        );
    end if;
    if v_message not like p_expected_message_like then
      raise exception using
        errcode = 'KP081',
        message = pg_catalog.format(
          '%s expected message LIKE %s, got: %s',
          p_context,
          p_expected_message_like,
          v_message
        );
    end if;
  end;
end;
$function$;

-- Global denominator mutants run after the fixed point. They exercise the
-- 47 published controls outside the repair spec and prove KL014 fires before
-- any of the 87 UUID-bound targets can change.
set local session_replication_role = replica;
update public.posts
set module = 'eventos',
    category = 'seminarios'
where id = (
  select id
  from pg_temp.kc_label_canonical_snapshot_20260808
  order by id
  limit 1
);
set local session_replication_role = origin;

select pg_temp.kc_expect_label_failure_20260808(
  'KL014',
  'category label reconciliation aborted: published preflight total=134 registry=133 admissible=133, expected 134/134/134',
  'published outside-registry control mutant'
);

do $global_control_no_write_assertion$
declare
  v_exact bigint;
begin
  select pg_catalog.count(*)
  into v_exact
  from public.posts p
  join pg_temp.kc_label_fixed_rows_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) = pg_catalog.to_jsonb(snapshot);

  if (v_exact = 87) is not true then
    raise exception using
      errcode = 'KP062',
      message = 'global outside-registry preflight changed a UUID-bound target';
  end if;
end;
$global_control_no_write_assertion$;

set local session_replication_role = replica;
update public.posts p
set module = snapshot.module,
    category = snapshot.category,
    metadata = snapshot.metadata,
    updated_at = snapshot.updated_at
from pg_temp.kc_label_canonical_snapshot_20260808 snapshot
where p.id = snapshot.id
  and p.id = (
    select id
    from pg_temp.kc_label_canonical_snapshot_20260808
    order by id
    limit 1
  );

insert into public.posts (
  id, title, module, category, status, visibility, price, metadata,
  created_at, updated_at
) values (
  '20000000-0000-4000-8000-000000000001'::uuid,
  'unexpected 135th published fixture',
  'eventos', 'academicos', 'published', 'public', 0,
  '{"category":"academicos","categoryKey":"academicos","categoriaKey":"academicos","categoryLabel":"Acadêmicos","categoria":"Acadêmicos","categoriaLabel":"Acadêmicos"}'::jsonb,
  '2026-01-01T00:00:00Z'::timestamptz,
  '2026-01-01T00:00:00Z'::timestamptz
);
set local session_replication_role = origin;

select pg_temp.kc_expect_label_failure_20260808(
  'KL014',
  'category label reconciliation aborted: published preflight total=135 registry=135 admissible=135, expected 134/134/134',
  'unexpected 135th published row mutant'
);

set local session_replication_role = replica;
delete from public.posts
where id = '20000000-0000-4000-8000-000000000001'::uuid;
set local session_replication_role = origin;

-- Third-state mutant: one earlier UUID is a valid source while a later UUID
-- is neither source nor target. Preflight must fail before writing the source.
set local session_replication_role = replica;
update public.posts p
set metadata = pg_temp.kc_surface_metadata_20260808(
  spec.source_touched_fingerprint,
  p.metadata - array[
    'category','categoryKey','categoriaKey','categoryLabel','categoria','categoriaLabel'
  ]::text[]
)
from pg_temp.kc_category_label_reconciliation_20260808 spec
where p.id = spec.id
  and spec.id = (
    select id
    from pg_temp.kc_category_label_reconciliation_20260808
    order by id
    limit 1
  );

update public.posts p
set metadata = pg_catalog.jsonb_set(
  p.metadata,
  '{categoryLabel}',
  '"third-state-mutant"'::jsonb,
  true
)
where p.id = (
  select id
  from pg_temp.kc_category_label_reconciliation_20260808
  order by id desc
  limit 1
);
set local session_replication_role = origin;

select pg_temp.kc_expect_label_failure_20260808(
  'KL009',
  'category label reconciliation aborted: unexpected six-surface state for post %',
  'third-state mutant'
);

do $preflight_before_write_assertion$
declare
  v_source_is_unchanged boolean;
begin
  select pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
    spec.source_touched_fingerprint
  into strict v_source_is_unchanged
  from public.posts p
  join pg_temp.kc_category_label_reconciliation_20260808 spec on spec.id = p.id
  where p.id = (
    select id
    from pg_temp.kc_category_label_reconciliation_20260808
    order by id
    limit 1
  );

  if v_source_is_unchanged is not true then
    raise exception using
      errcode = 'KP061',
      message = 'third-state preflight wrote an earlier valid source row';
  end if;
end;
$preflight_before_write_assertion$;

set local session_replication_role = replica;
update public.posts p
set metadata = snapshot.metadata,
    updated_at = snapshot.updated_at
from pg_temp.kc_label_fixed_rows_20260808 snapshot
where p.id = snapshot.id
  and p.id in (
    (
      select id from pg_temp.kc_category_label_reconciliation_20260808
      order by id limit 1
    ),
    (
      select id from pg_temp.kc_category_label_reconciliation_20260808
      order by id desc limit 1
    )
  );
set local session_replication_role = origin;

-- Metadata type and frozen price are part of each exact source/target state.
set local session_replication_role = replica;
update public.posts
set metadata = '[]'::jsonb
where id = (
  select id
  from pg_temp.kc_category_label_reconciliation_20260808
  order by id
  limit 1
);
set local session_replication_role = origin;
select pg_temp.kc_expect_label_failure_20260808(
  'KL008',
  'category label reconciliation aborted: metadata is not an object for post %',
  'non-object metadata mutant'
);
set local session_replication_role = replica;
update public.posts p
set metadata = snapshot.metadata,
    updated_at = snapshot.updated_at
from pg_temp.kc_label_fixed_rows_20260808 snapshot
where p.id = snapshot.id
  and p.id = (
    select id
    from pg_temp.kc_category_label_reconciliation_20260808
    order by id
    limit 1
  );
set local session_replication_role = origin;

set local session_replication_role = replica;
update public.posts p
set price = spec.expected_price + 1
from pg_temp.kc_category_label_reconciliation_20260808 spec
where p.id = spec.id
  and spec.expected_price = 0
  and spec.id = (
    select id
    from pg_temp.kc_category_label_reconciliation_20260808
    where expected_price = 0
    order by id
    limit 1
  );
set local session_replication_role = origin;
select pg_temp.kc_expect_label_failure_20260808(
  'KL008',
  'category label reconciliation aborted: base identity drift for post %',
  'price mutant'
);
set local session_replication_role = replica;
update public.posts p
set price = snapshot.price,
    updated_at = snapshot.updated_at
from pg_temp.kc_label_fixed_rows_20260808 snapshot
where p.id = snapshot.id
  and p.id = (
    select id
    from pg_temp.kc_category_label_reconciliation_20260808
    where expected_price = 0
    order by id
    limit 1
  );
set local session_replication_role = origin;

-- Missing UUID cardinality must fail and the exact full target row is restored
-- locally from the fixed snapshot.
set local session_replication_role = replica;
delete from public.posts
where id = (
  select id
  from pg_temp.kc_category_label_reconciliation_20260808
  order by id desc
  limit 1
);
set local session_replication_role = origin;
select pg_temp.kc_expect_label_failure_20260808(
  'KL007',
  'category label reconciliation aborted: locked 86 of 87 audited UUIDs',
  'missing UUID mutant'
);
set local session_replication_role = replica;
insert into public.posts
select snapshot.*
from pg_temp.kc_label_fixed_rows_20260808 snapshot
where snapshot.id = (
  select id
  from pg_temp.kc_category_label_reconciliation_20260808
  order by id desc
  limit 1
);
set local session_replication_role = origin;

-- Every required trigger is independently fail-closed.
alter table public.posts disable trigger kc_active_session_write_guard;
select pg_temp.kc_expect_label_failure_20260808(
  'KL006',
  'category label reconciliation aborted: required origin trigger kc_active_session_write_guard is absent or not O',
  'disabled active-session guard'
);
alter table public.posts enable trigger kc_active_session_write_guard;

alter table public.posts disable trigger kc_posts_set_updated_at;
select pg_temp.kc_expect_label_failure_20260808(
  'KL006',
  'category label reconciliation aborted: required origin trigger kc_posts_set_updated_at is absent or not O',
  'disabled updated-at trigger'
);
alter table public.posts enable trigger kc_posts_set_updated_at;

alter table public.posts disable trigger trg_posts_canonicalize_feed_fields;
select pg_temp.kc_expect_label_failure_20260808(
  'KL006',
  'category label reconciliation aborted: required origin trigger trg_posts_canonicalize_feed_fields is absent or not O',
  'disabled canonical trigger'
);
alter table public.posts enable trigger trg_posts_canonicalize_feed_fields;

-- A homonymous trigger with the right function/events/columns but a partial
-- WHEN clause must not satisfy the definition guard.
drop trigger trg_posts_canonicalize_feed_fields on public.posts;
create trigger trg_posts_canonicalize_feed_fields
before insert or update of module, category, metadata, price
on public.posts
for each row
when (false)
execute function public.kc_canonicalize_post_feed_fields();

select pg_temp.kc_expect_label_failure_20260808(
  'KL006',
  'category label reconciliation aborted: canonical trigger definition drifted',
  'canonical trigger WHEN mutant'
);

drop trigger trg_posts_canonicalize_feed_fields on public.posts;
create trigger trg_posts_canonicalize_feed_fields
before insert or update of module, category, metadata, price
on public.posts
for each row
execute function public.kc_canonicalize_post_feed_fields();

-- A second homonymous mutant exercises tgtype/tgattr rather than tgqual.
drop trigger trg_posts_canonicalize_feed_fields on public.posts;
create trigger trg_posts_canonicalize_feed_fields
before update of module, category, metadata
on public.posts
for each row
execute function public.kc_canonicalize_post_feed_fields();

select pg_temp.kc_expect_label_failure_20260808(
  'KL006',
  'category label reconciliation aborted: canonical trigger definition drifted',
  'canonical trigger shape mutant'
);

drop trigger trg_posts_canonicalize_feed_fields on public.posts;
create trigger trg_posts_canonicalize_feed_fields
before insert or update of module, category, metadata, price
on public.posts
for each row
execute function public.kc_canonicalize_post_feed_fields();

do $final_replay_assertion$
declare
  v_identical bigint;
  v_canonical_identical bigint;
  v_published bigint;
  v_global_exact bigint;
begin
  perform pg_temp.kc_assert_category_label_triggers_20260808();

  if pg_catalog.current_setting('session_replication_role') <> 'origin' then
    raise exception using
      errcode = 'KP070',
      message = 'replay proof left session_replication_role outside origin';
  end if;

  select pg_catalog.count(*)
  into v_identical
  from public.posts p
  join pg_temp.kc_label_fixed_rows_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) = pg_catalog.to_jsonb(snapshot);

  select pg_catalog.count(*)
  into v_canonical_identical
  from public.posts p
  join pg_temp.kc_label_canonical_snapshot_20260808 snapshot on snapshot.id = p.id
  where pg_catalog.to_jsonb(p) = pg_catalog.to_jsonb(snapshot);

  select pg_catalog.count(*)
  into v_published
  from public.posts
  where status = 'published';

  select pg_catalog.count(*)
  into v_global_exact
  from public.posts p
  where p.status = 'published'
    and public.kc_feed_category_label(p.module, p.category) is not null
    and pg_temp.kc_category_surface_fingerprint_20260808(p.metadata) =
      pg_temp.kc_expected_category_surface_20260808(
        p.category,
        public.kc_feed_category_label(p.module, p.category)
      );

  if (
    v_identical = 87
    and v_canonical_identical = 47
    and v_published = 134
    and v_global_exact = 134
  ) is not true then
    raise exception using
      errcode = 'KP071',
      message = pg_catalog.format(
        'mutant cleanup failed: targets=%s controls=%s published=%s exact=%s',
        v_identical,
        v_canonical_identical,
        v_published,
        v_global_exact
      );
  end if;
end;
$final_replay_assertion$;

rollback;
