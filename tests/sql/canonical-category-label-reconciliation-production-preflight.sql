\set ON_ERROR_STOP on

-- Strictly read-only production preflight. The caller must require every
-- capability and canonical_category_labels_ready to be true. No migration is
-- included and no persistent or temporary object is created.
begin transaction read only;

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
), spec_seed(
  id, expected_module, expected_category, expected_visibility, expected_price,
  source_variant, source_category_label, source_categoria
) as (
  values
    ('013df393-91c2-42a3-9508-b838558a0ee1'::uuid,'eventos','esportivos','public','0'::numeric,'standard_without_category','Esportivos','Esportivos'),
    ('018a96bf-1505-48fb-a6d7-3e3f26ea148e'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('01d7b015-ab92-4b3d-8e4d-4e88f32fe180'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('07ef7b16-8257-49e8-b8cf-bd6db2f9ef38'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('0a57fc77-9ab2-4d25-a4a4-f7203c9a1359'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('0ac23479-325c-428f-80d7-28431217bbde'::uuid,'oportunidades','cursos-capacitacoes','public','300'::numeric,'standard_without_category','Cursos e capacitações','Cursos e capacitações'),
    ('0cf1c2f6-5e65-4d02-8345-7aa82dc40a11'::uuid,'eventos','academicos','public',null::numeric,'standard_without_category','Pesquisa','Acadêmicos'),
    ('0e920527-0806-46f9-876f-24559a4562b9'::uuid,'oportunidades','cursos-capacitacoes','public','0'::numeric,'standard_without_category','Workshops','Cursos e capacitações'),
    ('0ec31a60-b8fb-4711-a921-3e951e942023'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('12550854-3a1a-4a39-b08c-d57e1cc7d8a7'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Acadêmicos','Acadêmicos'),
    ('168c9cbc-10a4-43a4-8b56-c9c1fb5176e2'::uuid,'oportunidades','concursos','public','0'::numeric,'standard_without_category','Academicos','Concursos'),
    ('17d7d6ec-a70d-4ab1-ae04-847d9b0a43dd'::uuid,'oportunidades','bolsas','public','0'::numeric,'standard_without_category','Bolsas','Bolsas'),
    ('2569361d-d799-463c-88af-2fb0a7f6bb90'::uuid,'oportunidades','concursos','public','13671.34'::numeric,'standard_without_category','Emprego','Concursos'),
    ('270d6932-5c04-4b15-8a60-c3340ad0a1b9'::uuid,'eventos','palestras','public','0'::numeric,'standard_without_category','Academico','Palestras'),
    ('2c0f70aa-8948-4335-bc57-66cfc86e2254'::uuid,'eventos','culturais','public','0'::numeric,'standard_with_category','Culturais','Culturais'),
    ('2d4d26b3-65c9-46d5-aced-66ec1ab182c8'::uuid,'oportunidades','pesquisa','public',null::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('31bbc912-570a-446a-a5aa-015141a42411'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('380404b0-8180-459c-bfb1-80812d42df1a'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_with_category','Pesquisa','Pesquisa'),
    ('39cd5662-a46b-42e3-b8de-64142d5b70bd'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('3b8d248c-f1db-45cb-adb5-cca9b49a90d9'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('3d500db4-bb75-4f09-ac0b-a9d0ec6123a4'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('403a9ed3-c194-4e2d-ba39-7686526be73c'::uuid,'oportunidades','cursos-capacitacoes','public',null::numeric,'standard_without_category','Cursos e capacitações','Cursos e capacitações'),
    ('4150a6ca-9d5e-4522-98a9-973952893cc7'::uuid,'eventos','congressos','public','0'::numeric,'standard_without_category','Pesquisa','Congressos'),
    ('447659fe-0787-4d79-bb04-8d038d56896f'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('45d5076e-23d9-490c-965d-03f1135e42ed'::uuid,'eventos','palestras','public','0'::numeric,'standard_without_category','Academico','Palestras'),
    ('4addd028-22ac-42c9-8688-015e9779da3f'::uuid,'eventos','academicos','public','0'::numeric,'standard_with_category','Academicos','Academicos'),
    ('4b39baaf-996b-49ca-a603-b122066946dd'::uuid,'oportunidades','bolsas','public','0'::numeric,'legacy_bolsa_partial',null::text,'Bolsas'),
    ('4f83362b-1af6-4b24-a521-0f242421b64e'::uuid,'oportunidades','bolsas','public','0'::numeric,'standard_without_category','Bolsas','Bolsas'),
    ('543c3dd3-d247-4830-b659-280fd8836757'::uuid,'eventos','palestras','public','0'::numeric,'standard_without_category','Pesquisa','Palestras'),
    ('5485a5ae-ca68-4e31-bfbe-7908045faf42'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('55008a05-3d79-5fbd-8aa2-666e2a0b71ff'::uuid,'oportunidades','cursos-capacitacoes','community','0'::numeric,'standard_without_category','Cursos e capacitações','Cursos e capacitações'),
    ('56746645-0aba-4806-97f7-49b739b73772'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('583893a9-a333-4a14-8ecc-7796d10dcf45'::uuid,'oportunidades','monitoria','public','0'::numeric,'standard_with_category','Academicos','Monitoria'),
    ('587af1e0-e3f8-4ffc-a4a0-bd3d1a715337'::uuid,'oportunidades','pesquisa','public',null::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('59a15d62-5a15-46b0-9408-b7c28b4ae823'::uuid,'eventos','workshops','public','0'::numeric,'standard_without_category','Workshops','Workshops'),
    ('5bfacd9c-2991-4264-a265-31763bc4b341'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('60649e01-5ef5-405e-90b5-a595e9216738'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('614b3721-8676-447c-8f7c-cf7e60e6c3ff'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('6198c272-e882-4f12-b19a-912e99ff1bf1'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('6643b77a-81c7-4354-86be-2e5eda0ecd6a'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('680de838-2a14-49d5-b1aa-9cb09f0f64ce'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_with_category','Pesquisa','Pesquisa'),
    ('68a0bbbc-e2ac-4792-b160-b7577a750d1b'::uuid,'eventos','congressos','public','0'::numeric,'standard_without_category','Congressos','Congressos'),
    ('6a43f20c-0b8b-472d-b43c-daa8c6b8cb38'::uuid,'eventos','congressos','public','0'::numeric,'standard_without_category','Academicos','Congressos'),
    ('70f02616-1131-4b16-b4a9-380139582ec1'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('7364a8a1-2fff-48f7-9f0c-4c9871f90a7f'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_with_category','Pesquisa','Pesquisa'),
    ('7a3e040a-72cb-443f-803c-aa1749b0d738'::uuid,'oportunidades','bolsas','public','0'::numeric,'standard_without_category','Pesquisa','Bolsas'),
    ('7bebc99a-8f12-4b55-b928-40c6c44bae24'::uuid,'eventos','culturais','public','0'::numeric,'standard_with_category','Culturais','Culturais'),
    ('7f6f688b-34f1-4912-b0f5-05a4dec65609'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('80b3ee37-d36c-4e09-af3b-9a897f4b5a6e'::uuid,'oportunidades','pesquisa','public',null::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('87195842-a086-4614-811d-406ad62d8f84'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('871e4c3b-417d-401c-90a1-94ffacc172f7'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('88dda63f-fe66-4553-9794-d732e2a93139'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('8a2ffc7d-9460-4686-acf8-865dac1db619'::uuid,'oportunidades','pesquisa','public',null::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('908393bb-c838-4266-940c-78dd79a1222e'::uuid,'eventos','workshops','public','0'::numeric,'standard_without_category','Workshops','Workshops'),
    ('92f20472-ec25-42b0-94b8-0b56d6255058'::uuid,'eventos','congressos','public','0'::numeric,'standard_without_category','Congressos','Congressos'),
    ('9d8b952f-c44b-5a66-804e-fdc4dd1be80e'::uuid,'oportunidades','editais','community','0'::numeric,'missing_category_and_category_label',null::text,'Editais'),
    ('a0e39686-a85e-4363-a945-f03e313b338d'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('a22262e7-794b-4f75-966a-7f65434eb530'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('a2be25d1-da54-4ee8-a6d3-fe6de9769011'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('a773eceb-be43-43b1-88db-4ee38f98343c'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('ac615cda-89e1-47fd-a1bf-74199e0fc5bf'::uuid,'eventos','palestras','public','0'::numeric,'standard_without_category','Pesquisa','Palestras'),
    ('ae78b207-f589-4ce8-941a-58a819c47303'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('af92b968-3198-43b6-8247-c4b507c5d150'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('b4ac0d24-4711-4758-948f-5e33e1fb1b29'::uuid,'oportunidades','editais','public',null::numeric,'standard_without_category','Editais','Editais'),
    ('b4aca32f-814d-4116-b396-2f30afad1494'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('b5ec0206-a634-4c32-b937-09145a78eb3f'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('bfb875e4-62d8-4f11-a2f3-78a1b5657f14'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('cb991ae6-3ca3-4183-b34e-3655ae1c4f15'::uuid,'eventos','workshops','public','0'::numeric,'standard_without_category','Workshops','Workshops'),
    ('cc13f596-231f-4a8d-b8fc-1466e407b19d'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('cdb9da59-eb5f-4344-99e0-e7b5b1fd2305'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('ceb74ea0-c8e5-4598-8e20-fabf43a48ef5'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('d7e177a2-b48e-441f-adb3-ab4b4c7a17df'::uuid,'eventos','workshops','public','0'::numeric,'standard_without_category','Workshops','Workshops'),
    ('d826a3be-ef42-4d04-8862-1bec56eb697b'::uuid,'oportunidades','empregos','public','0'::numeric,'standard_without_category','Empregos','Empregos'),
    ('dbfdf0cb-55f7-46ad-85ce-12cad27b3d12'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('dc5c09a9-df84-4062-a698-4042145bf07f'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('e2374c2d-53ef-4b48-a9c1-5518a06fcdc4'::uuid,'oportunidades','pesquisa','public',null::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('e3c9c66f-85f5-4dac-aff2-ab91e70c564b'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('e46c28f6-9605-4873-b904-ebd72442df07'::uuid,'oportunidades','pesquisa','public',null::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('e85ee2a3-535a-4483-b87c-c45cfdc7ba90'::uuid,'eventos','culturais','public','0'::numeric,'standard_without_category','Culturais','Culturais'),
    ('ee31c240-f962-482f-a8e4-3a550c43a2f6'::uuid,'eventos','congressos','public','0'::numeric,'standard_without_category','Congressos','Congressos'),
    ('f237d121-a585-459f-824c-9af3a06a7094'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('f2ff9855-77ae-40f3-bb7b-44140b0ac7ef'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('fac8d6ca-d66a-49d3-8356-9b208af22f75'::uuid,'eventos','academicos','public','0'::numeric,'standard_without_category','Academicos','Academicos'),
    ('fcd0f0b1-3093-49a0-8339-e8ba34b4114c'::uuid,'eventos','academicos','public','0'::numeric,'standard_with_category','Academicos','Academicos'),
    ('fdd48cde-1c6e-4faa-973c-00e02d3d7e75'::uuid,'eventos','workshops','public','0'::numeric,'standard_without_category','Academicos','Workshops'),
    ('fe26e460-5155-42de-b66f-e3785e25038c'::uuid,'oportunidades','pesquisa','public','0'::numeric,'standard_without_category','Pesquisa','Pesquisa'),
    ('ffd27f1a-91ba-5295-848c-eb940113d72c'::uuid,'oportunidades','pesquisa','community','0'::numeric,'with_category_without_category_label',null::text,'oportunidades')
), spec as (
  select
    seed.*,
    registry.label as expected_label,
    pg_catalog.jsonb_build_object(
      'category', pg_catalog.jsonb_build_object(
        'present', seed.source_variant in (
          'standard_with_category','with_category_without_category_label'
        ),
        'value', case
          when seed.source_variant in (
            'standard_with_category','with_category_without_category_label'
          ) then pg_catalog.to_jsonb(seed.expected_category)
          else 'null'::jsonb
        end
      ),
      'categoryKey', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(seed.expected_category)
      ),
      'categoriaKey', pg_catalog.jsonb_build_object(
        'present', seed.source_variant <> 'legacy_bolsa_partial',
        'value', case
          when seed.source_variant <> 'legacy_bolsa_partial'
            then pg_catalog.to_jsonb(seed.expected_category)
          else 'null'::jsonb
        end
      ),
      'categoryLabel', pg_catalog.jsonb_build_object(
        'present', seed.source_variant in (
          'standard_without_category','standard_with_category'
        ),
        'value', case
          when seed.source_variant in (
            'standard_without_category','standard_with_category'
          ) then pg_catalog.to_jsonb(seed.source_category_label)
          else 'null'::jsonb
        end
      ),
      'categoria', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(seed.source_categoria)
      ),
      'categoriaLabel', pg_catalog.jsonb_build_object(
        'present', false, 'value', 'null'::jsonb
      )
    ) as source_fingerprint,
    pg_catalog.jsonb_build_object(
      'category', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(seed.expected_category)
      ),
      'categoryKey', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(seed.expected_category)
      ),
      'categoriaKey', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(seed.expected_category)
      ),
      'categoryLabel', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(registry.label)
      ),
      'categoria', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(registry.label)
      ),
      'categoriaLabel', pg_catalog.jsonb_build_object(
        'present', true, 'value', pg_catalog.to_jsonb(registry.label)
      )
    ) as target_fingerprint
  from spec_seed seed
  join registry
    on registry.module = seed.expected_module
   and registry.category = seed.expected_category
), observed as (
  select
    spec.*,
    p.id as observed_id,
    p.module as observed_module,
    p.category as observed_category,
    p.status as observed_status,
    p.visibility as observed_visibility,
    p.price as observed_price,
    pg_catalog.jsonb_typeof(p.metadata) as metadata_type,
    pg_catalog.jsonb_build_object(
      'category', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'category', 'value', p.metadata->'category'
      ),
      'categoryKey', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoryKey', 'value', p.metadata->'categoryKey'
      ),
      'categoriaKey', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoriaKey', 'value', p.metadata->'categoriaKey'
      ),
      'categoryLabel', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoryLabel', 'value', p.metadata->'categoryLabel'
      ),
      'categoria', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoria', 'value', p.metadata->'categoria'
      ),
      'categoriaLabel', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoriaLabel', 'value', p.metadata->'categoriaLabel'
      )
    ) as observed_fingerprint
  from spec
  left join public.posts p on p.id = spec.id
), published as (
  select
    p.id,
    registry.category is not null as registry_pair,
    spec.id is not null as in_spec,
    pg_catalog.jsonb_build_object(
      'category', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'category', 'value', p.metadata->'category'
      ),
      'categoryKey', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoryKey', 'value', p.metadata->'categoryKey'
      ),
      'categoriaKey', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoriaKey', 'value', p.metadata->'categoriaKey'
      ),
      'categoryLabel', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoryLabel', 'value', p.metadata->'categoryLabel'
      ),
      'categoria', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoria', 'value', p.metadata->'categoria'
      ),
      'categoriaLabel', pg_catalog.jsonb_build_object(
        'present', p.metadata ? 'categoriaLabel', 'value', p.metadata->'categoriaLabel'
      )
    ) as observed_fingerprint,
    spec.source_fingerprint,
    coalesce(
      spec.target_fingerprint,
      pg_catalog.jsonb_build_object(
        'category', pg_catalog.jsonb_build_object(
          'present', true, 'value', pg_catalog.to_jsonb(registry.category)
        ),
        'categoryKey', pg_catalog.jsonb_build_object(
          'present', true, 'value', pg_catalog.to_jsonb(registry.category)
        ),
        'categoriaKey', pg_catalog.jsonb_build_object(
          'present', true, 'value', pg_catalog.to_jsonb(registry.category)
        ),
        'categoryLabel', pg_catalog.jsonb_build_object(
          'present', true, 'value', pg_catalog.to_jsonb(registry.label)
        ),
        'categoria', pg_catalog.jsonb_build_object(
          'present', true, 'value', pg_catalog.to_jsonb(registry.label)
        ),
        'categoriaLabel', pg_catalog.jsonb_build_object(
          'present', true, 'value', pg_catalog.to_jsonb(registry.label)
        )
      )
    ) as target_fingerprint,
    pg_catalog.jsonb_typeof(p.metadata) = 'object' as metadata_object
  from public.posts p
  left join registry
    on registry.module = p.module
   and registry.category = p.category
  left join spec on spec.id = p.id
  where p.status = 'published'
), trigger_capabilities as (
  select
    (
      select pg_catalog.count(*) = 3
      from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid = 'public.posts'::regclass
        and trigger_row.tgname in (
          'kc_active_session_write_guard',
          'kc_posts_set_updated_at',
          'trg_posts_canonicalize_feed_fields'
        )
        and trigger_row.tgenabled = 'O'
        and trigger_row.tgisinternal is false
    ) as required_triggers_o,
    exists (
      select 1
      from pg_catalog.pg_trigger trigger_row
      cross join lateral (
        select pg_catalog.array_agg(attribute_row.attname order by attribute_row.attname) as columns
        from pg_catalog.pg_attribute attribute_row
        where attribute_row.attrelid = trigger_row.tgrelid
          and attribute_row.attnum = any(trigger_row.tgattr)
      ) trigger_columns
      where trigger_row.tgrelid = 'public.posts'::regclass
        and trigger_row.tgname = 'trg_posts_canonicalize_feed_fields'
        and trigger_row.tgisinternal is false
        and trigger_row.tgenabled = 'O'
        and trigger_row.tgfoid =
          pg_catalog.to_regprocedure('public.kc_canonicalize_post_feed_fields()')
        and trigger_row.tgqual is null
        and trigger_row.tgtype = 23
        and trigger_columns.columns = array[
          'category','metadata','module','price'
        ]::name[]
    ) as canonical_trigger_shape
), capabilities as (
  select
    (
      select pg_catalog.count(*) = 34
      from registry
    ) as registry_34_pairs,
    (
      select pg_catalog.count(*) = 87
        and pg_catalog.count(distinct id) = 87
        and pg_catalog.count(*) filter (where expected_visibility = 'public') = 84
        and pg_catalog.count(*) filter (where expected_visibility = 'community') = 3
        and pg_catalog.count(*) filter (where expected_price = 0) = 76
        and pg_catalog.count(*) filter (where expected_price is null) = 9
        and pg_catalog.count(*) filter (where expected_price = 300) = 1
        and pg_catalog.count(*) filter (where expected_price = 13671.34) = 1
        and pg_catalog.count(*) filter (
          where source_fingerprint <> target_fingerprint
        ) = 87
      from spec
    ) as spec_87_exact_and_disjoint,
    (
      select pg_catalog.count(distinct observed_id) = 87
      from observed
    ) as observed_87_uuids,
    (
      select coalesce(pg_catalog.bool_and(
        observed_module = expected_module
        and observed_category = expected_category
        and observed_status = 'published'
        and observed_visibility = expected_visibility
        and observed_price is not distinct from expected_price
        and metadata_type = 'object'
      ), false)
      from observed
    ) as spec_base_identities,
    (
      select coalesce(pg_catalog.bool_and(
        observed_fingerprint in (source_fingerprint, target_fingerprint)
      ), false)
      from observed
    ) as spec_source_or_target,
    (
      select pg_catalog.count(*) filter (
        where observed_fingerprint = source_fingerprint
      ) = 87
        and pg_catalog.count(*) filter (
          where observed_fingerprint = target_fingerprint
        ) = 0
      from observed
    ) as spec_predeploy_source_state,
    (
      select pg_catalog.count(*) = 134
        and pg_catalog.count(*) filter (where registry_pair) = 134
        and pg_catalog.count(*) filter (
          where metadata_object
            and case
              when in_spec then observed_fingerprint in (
                source_fingerprint, target_fingerprint
              )
              else observed_fingerprint = target_fingerprint
            end
        ) = 134
        and pg_catalog.count(*) filter (where not in_spec) = 47
      from published
    ) as published_134_admissible,
    trigger_capabilities.required_triggers_o,
    trigger_capabilities.canonical_trigger_shape
  from trigger_capabilities
)
select
  registry_34_pairs,
  spec_87_exact_and_disjoint,
  observed_87_uuids,
  spec_base_identities,
  spec_source_or_target,
  spec_predeploy_source_state,
  published_134_admissible,
  required_triggers_o,
  canonical_trigger_shape,
  (
    registry_34_pairs
    and spec_87_exact_and_disjoint
    and observed_87_uuids
    and spec_base_identities
    and spec_source_or_target
    and spec_predeploy_source_state
    and published_134_admissible
    and required_triggers_o
    and canonical_trigger_shape
  ) is true as canonical_category_labels_ready
from capabilities;

rollback;
