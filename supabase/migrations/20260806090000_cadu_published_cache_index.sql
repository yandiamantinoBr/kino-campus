-- v78 cadu: partial indexes for the published-post cache used by the curator
-- and the format/publish stages.
--
-- Context (2026-08-06 incident, run 3cd1deef): the REST query
--   /rest/v1/posts?select=id,title,metadata&status=eq.published&order=id.asc
-- with Prefer: count=exact timed out 4x (12s each) during a transient Supabase
-- slowdown, aborting the whole pipeline at the curator stage.
--
-- These partial indexes keep the cache query (id ordering) and the cache
-- regenerator (created_at ordering) on the published subset without touching
-- feed contracts, RLS or application schemas.

-- Fail quickly instead of queueing a production writer behind an unexpected
-- long-running transaction. Supabase CLI 2.105.0 `db push` applies the migration
-- file and its ledger entry atomically; the disposable CLI proof guards that
-- exact deployment contract.
set local lock_timeout = '5s';
set local statement_timeout = '2min';

CREATE INDEX IF NOT EXISTS posts_cadu_published_cache_idx
  ON public.posts (id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS posts_cadu_published_created_idx
  ON public.posts (created_at DESC, id DESC)
  WHERE status = 'published';

-- IF NOT EXISTS checks only the relation name. Validate the complete catalog
-- identity before accepting a pre-existing homonym or commenting either index.
do $cache_index_postcondition$
declare
  v_posts_oid oid := pg_catalog.to_regclass('public.posts');
  v_id_attnum smallint;
  v_created_at_attnum smallint;
  v_uuid_ops oid;
  v_timestamptz_ops oid;
  v_cache_definition text;
  v_created_definition text;
begin
  if v_posts_oid is null then
    raise exception using
      errcode = 'P8600',
      message = 'cadu published cache index migration aborted: public.posts is absent';
  end if;

  select attribute.attnum
  into v_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = v_posts_oid
    and attribute.attname = 'id'
    and attribute.attnum > 0
    and attribute.attisdropped is false;

  select attribute.attnum
  into v_created_at_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = v_posts_oid
    and attribute.attname = 'created_at'
    and attribute.attnum > 0
    and attribute.attisdropped is false;

  select operator_class.oid
  into v_uuid_ops
  from pg_catalog.pg_opclass operator_class
  join pg_catalog.pg_namespace namespace
    on namespace.oid = operator_class.opcnamespace
  join pg_catalog.pg_am access_method
    on access_method.oid = operator_class.opcmethod
  where namespace.nspname = 'pg_catalog'
    and access_method.amname = 'btree'
    and operator_class.opcname = 'uuid_ops';

  select operator_class.oid
  into v_timestamptz_ops
  from pg_catalog.pg_opclass operator_class
  join pg_catalog.pg_namespace namespace
    on namespace.oid = operator_class.opcnamespace
  join pg_catalog.pg_am access_method
    on access_method.oid = operator_class.opcmethod
  where namespace.nspname = 'pg_catalog'
    and access_method.amname = 'btree'
    and operator_class.opcname = 'timestamptz_ops';

  if (
    v_id_attnum is not null
    and v_created_at_attnum is not null
    and v_uuid_ops is not null
    and v_timestamptz_ops is not null
  ) is not true then
    raise exception using
      errcode = 'P8600',
      message = 'cadu published cache index migration aborted: required columns or btree operator classes are absent';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_metadata
    join pg_catalog.pg_class index_relation
      on index_relation.oid = index_metadata.indexrelid
    join pg_catalog.pg_namespace index_namespace
      on index_namespace.oid = index_relation.relnamespace
    join pg_catalog.pg_am access_method
      on access_method.oid = index_relation.relam
    where index_metadata.indexrelid = pg_catalog.to_regclass(
      'public.posts_cadu_published_cache_idx'
    )
      and index_namespace.nspname = 'public'
      and index_relation.relname = 'posts_cadu_published_cache_idx'
      and index_relation.relkind = 'i'
      and access_method.amname = 'btree'
      and index_metadata.indrelid = v_posts_oid
      and index_metadata.indnkeyatts = 1
      and index_metadata.indnatts = 1
      and index_metadata.indkey::text = v_id_attnum::text
      and index_metadata.indclass::text = v_uuid_ops::text
      and index_metadata.indcollation::text = '0'
      and index_metadata.indoption::text = '0'
      and index_metadata.indexprs is null
      and pg_catalog.pg_get_indexdef(index_metadata.indexrelid) =
        'CREATE INDEX posts_cadu_published_cache_idx ON public.posts USING btree (id) WHERE (status = ''published''::text)'
      and pg_catalog.pg_get_expr(
        index_metadata.indpred,
        index_metadata.indrelid,
        false
      ) = '(status = ''published''::text)'
      and index_metadata.indisvalid is true
      and index_metadata.indisready is true
      and index_metadata.indislive is true
      and index_metadata.indisunique is false
      and index_metadata.indisprimary is false
      and index_metadata.indisexclusion is false
  ) then
    select pg_catalog.pg_get_indexdef(
      pg_catalog.to_regclass('public.posts_cadu_published_cache_idx')
    )
    into v_cache_definition;

    raise exception using
      errcode = 'P8601',
      message = pg_catalog.format(
        'cadu published cache index migration aborted: posts_cadu_published_cache_idx has an unexpected definition: %s',
        coalesce(v_cache_definition, '<absent>')
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_metadata
    join pg_catalog.pg_class index_relation
      on index_relation.oid = index_metadata.indexrelid
    join pg_catalog.pg_namespace index_namespace
      on index_namespace.oid = index_relation.relnamespace
    join pg_catalog.pg_am access_method
      on access_method.oid = index_relation.relam
    where index_metadata.indexrelid = pg_catalog.to_regclass(
      'public.posts_cadu_published_created_idx'
    )
      and index_namespace.nspname = 'public'
      and index_relation.relname = 'posts_cadu_published_created_idx'
      and index_relation.relkind = 'i'
      and access_method.amname = 'btree'
      and index_metadata.indrelid = v_posts_oid
      and index_metadata.indnkeyatts = 2
      and index_metadata.indnatts = 2
      and index_metadata.indkey::text = pg_catalog.format(
        '%s %s',
        v_created_at_attnum,
        v_id_attnum
      )
      and index_metadata.indclass::text = pg_catalog.format(
        '%s %s',
        v_timestamptz_ops,
        v_uuid_ops
      )
      -- btree indoption bits: DESC (1) + NULLS FIRST (2). DESC without an
      -- explicit NULLS clause therefore has the exact vector "3 3".
      and index_metadata.indoption::text = '3 3'
      and index_metadata.indcollation::text = '0 0'
      and index_metadata.indexprs is null
      and pg_catalog.pg_get_indexdef(index_metadata.indexrelid) =
        'CREATE INDEX posts_cadu_published_created_idx ON public.posts USING btree (created_at DESC, id DESC) WHERE (status = ''published''::text)'
      and pg_catalog.pg_get_expr(
        index_metadata.indpred,
        index_metadata.indrelid,
        false
      ) = '(status = ''published''::text)'
      and index_metadata.indisvalid is true
      and index_metadata.indisready is true
      and index_metadata.indislive is true
      and index_metadata.indisunique is false
      and index_metadata.indisprimary is false
      and index_metadata.indisexclusion is false
  ) then
    select pg_catalog.pg_get_indexdef(
      pg_catalog.to_regclass('public.posts_cadu_published_created_idx')
    )
    into v_created_definition;

    raise exception using
      errcode = 'P8602',
      message = pg_catalog.format(
        'cadu published cache index migration aborted: posts_cadu_published_created_idx has an unexpected definition: %s',
        coalesce(v_created_definition, '<absent>')
      );
  end if;
end;
$cache_index_postcondition$;

COMMENT ON INDEX public.posts_cadu_published_cache_idx IS
  'cadu: cache publicado do curador/format ordena por id (status published)';
COMMENT ON INDEX public.posts_cadu_published_created_idx IS
  'cadu: regeneracao do cache publicado ordena por created_at desc';

do $cache_index_comment_postcondition$
begin
  if (
    pg_catalog.obj_description(
      pg_catalog.to_regclass('public.posts_cadu_published_cache_idx'),
      'pg_class'
    ) = 'cadu: cache publicado do curador/format ordena por id (status published)'
    and pg_catalog.obj_description(
      pg_catalog.to_regclass('public.posts_cadu_published_created_idx'),
      'pg_class'
    ) = 'cadu: regeneracao do cache publicado ordena por created_at desc'
  ) is not true then
    raise exception using
      errcode = 'P8603',
      message = 'cadu published cache index migration aborted: index comments failed postcondition';
  end if;
end;
$cache_index_comment_postcondition$;
