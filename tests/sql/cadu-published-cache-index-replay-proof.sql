\set ON_ERROR_STOP on

-- Local-only DDL proof. The dedicated runner expands the migration verbatim,
-- executes both includes inside this rollback-only transaction and verifies the
-- complete catalog state again after ROLLBACK. A separate disposable-database
-- proof exercises the unmodified file through Supabase CLI 2.105.0.
begin;

drop index if exists public.posts_cadu_published_cache_idx;
drop index if exists public.posts_cadu_published_created_idx;

\ir ../../supabase/migrations/20260806090000_cadu_published_cache_index.sql

do $first_run_assertion$
declare
  v_exact_indexes bigint;
begin
  select pg_catalog.count(*)
  into v_exact_indexes
  from pg_catalog.pg_index index_metadata
  join pg_catalog.pg_class index_relation
    on index_relation.oid = index_metadata.indexrelid
  join pg_catalog.pg_namespace index_namespace
    on index_namespace.oid = index_relation.relnamespace
  join pg_catalog.pg_am access_method
    on access_method.oid = index_relation.relam
  where index_namespace.nspname = 'public'
    and index_relation.relname in (
      'posts_cadu_published_cache_idx',
      'posts_cadu_published_created_idx'
    )
    and access_method.amname = 'btree'
    and index_metadata.indrelid = 'public.posts'::regclass
    and index_metadata.indisvalid is true
    and index_metadata.indisready is true
    and index_metadata.indislive is true
    and index_metadata.indnkeyatts = index_metadata.indnatts
    and index_metadata.indexprs is null
    and pg_catalog.pg_get_expr(
      index_metadata.indpred,
      index_metadata.indrelid,
      false
    ) = '(status = ''published''::text)'
    and (
      (
        index_relation.relname = 'posts_cadu_published_cache_idx'
        and pg_catalog.pg_get_indexdef(index_metadata.indexrelid) =
          'CREATE INDEX posts_cadu_published_cache_idx ON public.posts USING btree (id) WHERE (status = ''published''::text)'
        and index_metadata.indoption::text = '0'
        and pg_catalog.obj_description(index_metadata.indexrelid, 'pg_class') =
          'cadu: cache publicado do curador/format ordena por id (status published)'
      )
      or
      (
        index_relation.relname = 'posts_cadu_published_created_idx'
        and pg_catalog.pg_get_indexdef(index_metadata.indexrelid) =
          'CREATE INDEX posts_cadu_published_created_idx ON public.posts USING btree (created_at DESC, id DESC) WHERE (status = ''published''::text)'
        and index_metadata.indoption::text = '3 3'
        and pg_catalog.obj_description(index_metadata.indexrelid, 'pg_class') =
          'cadu: regeneracao do cache publicado ordena por created_at desc'
      )
    );

  if (v_exact_indexes = 2) is not true then
    raise exception using
      errcode = 'P8610',
      message = pg_catalog.format(
        'cadu published cache index proof expected 2 exact indexes, found %s',
        v_exact_indexes
      );
  end if;
end;
$first_run_assertion$;

create temporary table kc_cadu_cache_index_snapshot_20260806 on commit drop as
select
  index_metadata.indexrelid,
  index_relation.relname,
  pg_catalog.pg_get_indexdef(index_metadata.indexrelid) as index_definition,
  pg_catalog.pg_get_expr(
    index_metadata.indpred,
    index_metadata.indrelid,
    false
  ) as index_predicate,
  index_metadata.indkey::text as index_keys,
  index_metadata.indclass::text as index_opclasses,
  index_metadata.indoption::text as index_options,
  index_metadata.indcollation::text as index_collations,
  index_metadata.indisvalid,
  index_metadata.indisready,
  index_metadata.indislive,
  pg_catalog.obj_description(index_metadata.indexrelid, 'pg_class') as index_comment
from pg_catalog.pg_index index_metadata
join pg_catalog.pg_class index_relation
  on index_relation.oid = index_metadata.indexrelid
join pg_catalog.pg_namespace index_namespace
  on index_namespace.oid = index_relation.relnamespace
where index_namespace.nspname = 'public'
  and index_relation.relname in (
    'posts_cadu_published_cache_idx',
    'posts_cadu_published_created_idx'
  );

-- Exact pre-existing definitions must be accepted without rebuild or mutation.
\ir ../../supabase/migrations/20260806090000_cadu_published_cache_index.sql

do $idempotence_assertion$
declare
  v_unchanged_indexes bigint;
begin
  select pg_catalog.count(*)
  into v_unchanged_indexes
  from pg_catalog.pg_index index_metadata
  join pg_catalog.pg_class index_relation
    on index_relation.oid = index_metadata.indexrelid
  join pg_catalog.pg_namespace index_namespace
    on index_namespace.oid = index_relation.relnamespace
  join pg_temp.kc_cadu_cache_index_snapshot_20260806 snapshot
    on snapshot.indexrelid = index_metadata.indexrelid
   and snapshot.relname = index_relation.relname
   and snapshot.index_definition = pg_catalog.pg_get_indexdef(index_metadata.indexrelid)
   and snapshot.index_predicate = pg_catalog.pg_get_expr(
     index_metadata.indpred,
     index_metadata.indrelid,
     false
   )
   and snapshot.index_keys = index_metadata.indkey::text
   and snapshot.index_opclasses = index_metadata.indclass::text
   and snapshot.index_options = index_metadata.indoption::text
   and snapshot.index_collations = index_metadata.indcollation::text
   and snapshot.indisvalid = index_metadata.indisvalid
   and snapshot.indisready = index_metadata.indisready
   and snapshot.indislive = index_metadata.indislive
   and snapshot.index_comment = pg_catalog.obj_description(
     index_metadata.indexrelid,
     'pg_class'
   )
  where index_namespace.nspname = 'public';

  if (v_unchanged_indexes = 2) is not true then
    raise exception using
      errcode = 'P8611',
      message = 'cadu published cache index idempotent replay changed an index';
  end if;
end;
$idempotence_assertion$;

rollback;
