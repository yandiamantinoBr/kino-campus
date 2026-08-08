-- Read-only production preflight for the two audited rows. The caller must
-- reject an empty response, a non-boolean value or any value other than true.
-- This file never applies the migration.
begin transaction read only;

with expected(
  id,
  expected_module,
  expected_category,
  expected_status,
  expected_visibility,
  expected_price,
  source_category_key,
  source_category_label,
  target_category_key,
  target_category_label
) as (
  values
    (
      '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
      'oportunidades'::text,
      'bolsas'::text,
      'published'::text,
      'public'::text,
      0::numeric,
      'pesquisa'::text,
      'Pesquisa'::text,
      'bolsas'::text,
      'Bolsas'::text
    ),
    (
      'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid,
      'eventos',
      'congressos',
      'published',
      'public',
      0,
      'academicos',
      'Academicos',
      'congressos',
      'Congressos'
    )
), observed as (
  select
    expected.*,
    p.id as observed_id,
    (
      p.module = expected.expected_module
      and p.category = expected.expected_category
      and p.status = expected.expected_status
      and p.visibility = expected.expected_visibility
      and p.price is not distinct from expected.expected_price
      and pg_catalog.jsonb_typeof(p.metadata) = 'object'
    ) is true as base_identity_ok,
    (
      p.metadata->>'category' is null
      and p.metadata->>'categoryKey' = expected.source_category_key
      and p.metadata->>'categoriaKey' = expected.source_category_key
      and p.metadata->>'categoryLabel' = expected.source_category_label
      and p.metadata->>'categoria' = expected.source_category_label
      and p.metadata->>'categoriaLabel' is null
    ) is true as source_metadata_ok,
    (
      p.metadata->>'category' = expected.target_category_key
      and p.metadata->>'categoryKey' = expected.target_category_key
      and p.metadata->>'categoriaKey' = expected.target_category_key
      and p.metadata->>'categoryLabel' = expected.target_category_label
      and p.metadata->>'categoria' = expected.target_category_label
      and p.metadata->>'categoriaLabel' = expected.target_category_label
    ) is true as target_metadata_ok
  from expected
  left join public.posts p on p.id = expected.id
), capabilities as (
  select
    (
      select
        pg_catalog.count(*) = 2
        and pg_catalog.count(distinct id) = 2
      from expected
    )
      as audited_spec_cardinality,
    pg_catalog.count(distinct observed_id) = 2 as audited_uuid_cardinality,
    coalesce(
      pg_catalog.bool_and(base_identity_ok),
      false
    ) as audited_base_identity,
    coalesce(
      pg_catalog.bool_and(
        (source_metadata_ok or target_metadata_ok) is true
      ),
      false
    ) as audited_source_or_target_state,
    (
      select pg_catalog.count(*) = 2
      from pg_catalog.pg_trigger
      where tgrelid = 'public.posts'::regclass
        and tgname in (
          'kc_posts_set_updated_at',
          'trg_posts_canonicalize_feed_fields'
        )
        and tgenabled = 'O'
    ) as audited_update_triggers
  from observed
)
select
  audited_spec_cardinality,
  audited_uuid_cardinality,
  audited_base_identity,
  audited_source_or_target_state,
  audited_update_triggers,
  (
    audited_spec_cardinality
    and audited_uuid_cardinality
    and audited_base_identity
    and audited_source_or_target_state
    and audited_update_triggers
  ) is true as audited_category_metadata_ready
from capabilities;

rollback;
