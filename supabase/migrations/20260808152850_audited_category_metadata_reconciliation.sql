-- Reconcile two audited published rows whose canonical posts.category was
-- already correct, but whose category identity metadata still pointed at a
-- different valid category. The UI reads both surfaces, so this drift can
-- make a server-filtered card disappear again in the browser.
--
-- Existing rows are accepted only in the exact audited source state or in the
-- complete target state. An empty posts table is a safe reset/preview no-op;
-- every non-empty database must contain both audited UUIDs or fail closed.

drop table if exists pg_temp.kc_category_metadata_reconciliation_20260808;

create temporary table kc_category_metadata_reconciliation_20260808 (
  id uuid primary key,
  expected_module text not null,
  expected_category text not null,
  expected_status text not null,
  source_category_key text not null,
  source_category_label text not null,
  target_category_key text not null,
  target_category_label text not null
) on commit drop;

insert into pg_temp.kc_category_metadata_reconciliation_20260808 (
  id,
  expected_module,
  expected_category,
  expected_status,
  source_category_key,
  source_category_label,
  target_category_key,
  target_category_label
) values
  (
    '2c139f6c-8d05-43f6-b242-85980428e0d7'::uuid,
    'oportunidades', 'bolsas', 'published',
    'pesquisa', 'Pesquisa',
    'bolsas', 'Bolsas'
  ),
  (
    'ce24a542-294c-4048-b0ea-2f2b4a435fe2'::uuid,
    'eventos', 'congressos', 'published',
    'academicos', 'Academicos',
    'congressos', 'Congressos'
  );

create or replace function pg_temp.kc_run_category_metadata_reconciliation_20260808()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_spec record;
  v_post record;
  v_is_source boolean;
  v_is_target boolean;
  v_existing_posts bigint;
  v_audited_posts bigint;
  v_target_posts bigint;
begin
  select count(*) into v_existing_posts from public.posts;
  if v_existing_posts = 0 then
    return;
  end if;

  select count(*)
  into v_audited_posts
  from public.posts p
  join pg_temp.kc_category_metadata_reconciliation_20260808 v on v.id = p.id;

  if v_audited_posts <> 2 then
    raise exception 'category metadata reconciliation aborted: expected both audited posts, found %', v_audited_posts;
  end if;

  for v_spec in
    select *
    from pg_temp.kc_category_metadata_reconciliation_20260808
    order by id
  loop
    select p.module, p.category, p.status, p.metadata
    into v_post
    from public.posts p
    where p.id = v_spec.id
    for update;

    if not found then
      raise exception 'category metadata reconciliation aborted: audited post % disappeared after preflight', v_spec.id;
    end if;

    if jsonb_typeof(v_post.metadata) <> 'object' then
      raise exception 'category metadata reconciliation aborted: metadata for post % is not an object', v_spec.id;
    end if;

    v_is_source :=
      v_post.module = v_spec.expected_module
      and v_post.category = v_spec.expected_category
      and v_post.status = v_spec.expected_status
      and v_post.metadata->>'category' is null
      and v_post.metadata->>'categoryKey' = v_spec.source_category_key
      and v_post.metadata->>'categoriaKey' = v_spec.source_category_key
      and v_post.metadata->>'categoryLabel' = v_spec.source_category_label
      and v_post.metadata->>'categoria' = v_spec.source_category_label
      and v_post.metadata->>'categoriaLabel' is null;

    v_is_target :=
      v_post.module = v_spec.expected_module
      and v_post.category = v_spec.expected_category
      and v_post.status = v_spec.expected_status
      and v_post.metadata->>'category' = v_spec.target_category_key
      and v_post.metadata->>'categoryKey' = v_spec.target_category_key
      and v_post.metadata->>'categoriaKey' = v_spec.target_category_key
      and v_post.metadata->>'categoryLabel' = v_spec.target_category_label
      and v_post.metadata->>'categoria' = v_spec.target_category_label
      and v_post.metadata->>'categoriaLabel' = v_spec.target_category_label;

    if not v_is_source and not v_is_target then
      raise exception 'category metadata reconciliation aborted: unexpected state for post %', v_spec.id;
    end if;
  end loop;

  update public.posts p
  set metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(p.metadata, '{category}', to_jsonb(v.target_category_key), true),
            '{categoryKey}', to_jsonb(v.target_category_key), true
          ),
          '{categoriaKey}', to_jsonb(v.target_category_key), true
        ),
        '{categoryLabel}', to_jsonb(v.target_category_label), true
      ),
      '{categoria}', to_jsonb(v.target_category_label), true
    ),
    '{categoriaLabel}', to_jsonb(v.target_category_label), true
  )
  from pg_temp.kc_category_metadata_reconciliation_20260808 v
  where p.id = v.id
    and p.module = v.expected_module
    and p.category = v.expected_category
    and p.status = v.expected_status
    and p.metadata->>'category' is null
    and p.metadata->>'categoryKey' = v.source_category_key
    and p.metadata->>'categoriaKey' = v.source_category_key
    and p.metadata->>'categoryLabel' = v.source_category_label
    and p.metadata->>'categoria' = v.source_category_label
    and p.metadata->>'categoriaLabel' is null;

  select count(*)
  into v_target_posts
  from public.posts p
  join pg_temp.kc_category_metadata_reconciliation_20260808 v on v.id = p.id
  where p.module = v.expected_module
    and p.category = v.expected_category
    and p.status = v.expected_status
    and p.metadata->>'category' = v.target_category_key
    and p.metadata->>'categoryKey' = v.target_category_key
    and p.metadata->>'categoriaKey' = v.target_category_key
    and p.metadata->>'categoryLabel' = v.target_category_label
    and p.metadata->>'categoria' = v.target_category_label
    and p.metadata->>'categoriaLabel' = v.target_category_label;

  if v_target_posts <> 2 then
    raise exception 'category metadata reconciliation failed postcondition: expected 2 targets, found %', v_target_posts;
  end if;
end;
$function$;

-- The only data-changing statement. Lock, full preflight, update and complete
-- postcondition all execute atomically inside this single function call.
select pg_temp.kc_run_category_metadata_reconciliation_20260808();
