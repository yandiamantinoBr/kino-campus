begin;

create extension if not exists pgtap with schema extensions;

select extensions.no_plan();

select extensions.has_function(
  'public',
  'kc_account_audit_identifier_inventory',
  array['uuid'],
  'audit identifier inventory RPC exists'
);
select extensions.has_function(
  'public',
  'kc_redact_account_audit_identifiers',
  array['uuid'],
  'atomic audit identifier redaction RPC exists'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.kc_redact_account_audit_identifiers(uuid)',
    'execute'
  ),
  'service role can execute audit redaction'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.kc_redact_account_audit_identifiers(uuid)',
    'execute'
  ),
  'authenticated clients cannot redact audit history'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000991', 'audit-erasure-target@example.test'),
  ('00000000-0000-4000-8000-000000000992', 'audit-erasure-survivor@example.test');

insert into public.profiles (id, email, full_name, is_admin)
values
  (
    '00000000-0000-4000-8000-000000000991',
    'audit-erasure-target@example.test',
    'Audit Erasure Target',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000992',
    'audit-erasure-survivor@example.test',
    'Audit Erasure Survivor',
    true
  );

insert into public.audit_log (
  id,
  actor_id,
  action,
  entity_type,
  entity_id,
  payload,
  created_at
) values (
  '10000000-0000-4000-8000-000000000991',
  '00000000-0000-4000-8000-000000000991',
  'audit_redaction_fixture',
  'profiles',
  '00000000-0000-4000-8000-000000000991',
  pg_catalog.jsonb_build_object(
    'user_id', '00000000-0000-4000-8000-000000000991',
    'nested', pg_catalog.jsonb_build_object(
      'before', pg_catalog.jsonb_build_object(
        'updated_by', '00000000-0000-4000-8000-000000000991'
      ),
      'after', pg_catalog.jsonb_build_array(
        '00000000-0000-4000-8000-000000000991',
        pg_catalog.jsonb_build_object(
          'survivor_id', '00000000-0000-4000-8000-000000000992'
        )
      )
    ),
    'note',
      'prefix-00000000-0000-4000-8000-000000000991-suffix'
  ) || pg_catalog.jsonb_build_object(
    '00000000-0000-4000-8000-000000000991',
    'UUID used as a JSON key must remain unchanged'
  ),
  '2026-07-28 18:45:00+00'
);

insert into public.ad_campaign_audit (
  id,
  campaign_id,
  action,
  changed_by,
  changed_at,
  snapshot
) values (
  84500991,
  null,
  'update',
  '00000000-0000-4000-8000-000000000991',
  '2026-07-28 18:45:01+00',
  pg_catalog.jsonb_build_object(
    'old', pg_catalog.jsonb_build_object(
      'created_by', '00000000-0000-4000-8000-000000000991'
    ),
    'new', pg_catalog.jsonb_build_object(
      'updated_by', '00000000-0000-4000-8000-000000000991',
      'owner_note', 'keep-00000000-0000-4000-8000-000000000991-inside-text'
    )
  )
);

insert into public.hero_banner_audit (
  id,
  banner_id,
  action,
  changed_by,
  changed_at,
  snapshot
) values (
  84500991,
  null,
  'update',
  '00000000-0000-4000-8000-000000000991',
  '2026-07-28 18:45:02+00',
  pg_catalog.jsonb_build_object(
    'created_by', '00000000-0000-4000-8000-000000000991',
    'nested', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'updated_by', '00000000-0000-4000-8000-000000000991'
      )
    )
  )
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000992","role":"service_role"}',
  true
);
set local role service_role;

select extensions.is(
  public.kc_account_audit_identifier_inventory(
    '00000000-0000-4000-8000-000000000991'
  ) - 'identifiers_remaining',
  '{
    "ok": true,
    "audit_log_rows": 1,
    "ad_campaign_audit_rows": 1,
    "hero_banner_audit_rows": 1
  }'::jsonb,
  'database-side preflight inventories all three audit sets without downloading tables'
);

reset role;

create or replace function pg_temp.kc_fail_hero_audit_redaction()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'TEST_AUDIT_REDACTION_ROLLBACK';
end;
$$;

create trigger kc_test_fail_hero_audit_redaction
before update on public.hero_banner_audit
for each row
when (old.id = 84500991)
execute function pg_temp.kc_fail_hero_audit_redaction();

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000992","role":"service_role"}',
  true
);
set local role service_role;

select extensions.throws_ok(
  $$select public.kc_redact_account_audit_identifiers(
    '00000000-0000-4000-8000-000000000991'
  )$$,
  'P0001',
  'TEST_AUDIT_REDACTION_ROLLBACK',
  'a failure in the third table aborts the atomic redaction'
);

reset role;

select extensions.ok(
  (
    select actor_id = '00000000-0000-4000-8000-000000000991'
      and entity_id = '00000000-0000-4000-8000-000000000991'
      and payload ->> 'user_id' = '00000000-0000-4000-8000-000000000991'
    from public.audit_log
    where id = '10000000-0000-4000-8000-000000000991'
  ),
  'audit_log changes roll back when another table fails'
);
select extensions.ok(
  (
    select changed_by = '00000000-0000-4000-8000-000000000991'
      and snapshot #>> '{old,created_by}' = '00000000-0000-4000-8000-000000000991'
    from public.ad_campaign_audit
    where id = 84500991
  ),
  'ad campaign audit changes roll back with the same statement'
);
select extensions.ok(
  (
    select changed_by = '00000000-0000-4000-8000-000000000991'
      and snapshot ->> 'created_by' = '00000000-0000-4000-8000-000000000991'
    from public.hero_banner_audit
    where id = 84500991
  ),
  'hero banner audit fixture also remains untouched after rollback'
);

drop trigger kc_test_fail_hero_audit_redaction on public.hero_banner_audit;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000992","role":"service_role"}',
  true
);
set local role service_role;

with redaction as (
  select public.kc_redact_account_audit_identifiers(
    '00000000-0000-4000-8000-000000000991'
  ) as result
)
select extensions.ok(
  result - 'inventory_digest' = '{
      "ok": true,
      "audit_log_rows": 1,
      "ad_campaign_audit_rows": 1,
      "hero_banner_audit_rows": 1,
      "identifiers_remaining": false,
      "events_preserved": true
    }'::jsonb
    and result ->> 'inventory_digest' ~ '^[a-f0-9]{64}$'
    and (select count(*) from pg_catalog.jsonb_object_keys(result)) = 7,
  'atomic RPC reports exact preserved cardinality and a zero-residual postcondition'
)
from redaction;

reset role;

select extensions.is(
  (
    select count(*)::integer
    from public.audit_log
    where id = '10000000-0000-4000-8000-000000000991'
      and action = 'audit_redaction_fixture'
      and entity_type = 'profiles'
      and created_at = '2026-07-28 18:45:00+00'
  ),
  1,
  'audit_log event, action, type and timestamp are preserved'
);
select extensions.is(
  (
    select count(*)::integer
    from public.ad_campaign_audit
    where id = 84500991
      and action = 'update'
      and changed_at = '2026-07-28 18:45:01+00'
  ),
  1,
  'ad campaign event action and timestamp are preserved'
);
select extensions.is(
  (
    select count(*)::integer
    from public.hero_banner_audit
    where id = 84500991
      and action = 'update'
      and changed_at = '2026-07-28 18:45:02+00'
  ),
  1,
  'hero banner event action and timestamp are preserved'
);

select extensions.ok(
  (
    select actor_id is null
      and entity_id <> '00000000-0000-4000-8000-000000000991'
      and not (
        kc_private.kc_redact_exact_json_string(
          payload,
          '00000000-0000-4000-8000-000000000991'
        ) is distinct from payload
      )
    from public.audit_log
    where id = '10000000-0000-4000-8000-000000000991'
  ),
  'audit_log FK, entity UUID and every exact nested JSON value are desidentified'
);
select extensions.ok(
  (
    select changed_by is null
      and not (
        kc_private.kc_redact_exact_json_string(
          snapshot,
          '00000000-0000-4000-8000-000000000991'
        ) is distinct from snapshot
      )
    from public.ad_campaign_audit
    where id = 84500991
  ),
  'ad campaign snapshot has no exact target UUID at any depth'
);
select extensions.ok(
  (
    select changed_by is null
      and not (
        kc_private.kc_redact_exact_json_string(
          snapshot,
          '00000000-0000-4000-8000-000000000991'
        ) is distinct from snapshot
      )
    from public.hero_banner_audit
    where id = 84500991
  ),
  'hero banner snapshot has no exact target UUID at any depth'
);

select extensions.is(
  (
    select payload ->> 'note'
    from public.audit_log
    where id = '10000000-0000-4000-8000-000000000991'
  ),
  'prefix-00000000-0000-4000-8000-000000000991-suffix',
  'UUID substrings are not over-redacted'
);
select extensions.is(
  (
    select payload ->> '00000000-0000-4000-8000-000000000991'
    from public.audit_log
    where id = '10000000-0000-4000-8000-000000000991'
  ),
  'UUID used as a JSON key must remain unchanged',
  'JSON keys are preserved because only exact string values are in scope'
);

create temporary table audit_redaction_entity_checkpoint as
select entity_id
from public.audit_log
where id = '10000000-0000-4000-8000-000000000991';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000992","role":"service_role"}',
  true
);
set local role service_role;

with idempotent_redaction as (
  select public.kc_redact_account_audit_identifiers(
    '00000000-0000-4000-8000-000000000991'
  ) as result
)
select extensions.ok(
  result - 'inventory_digest' = '{
      "ok": true,
      "audit_log_rows": 0,
      "ad_campaign_audit_rows": 0,
      "hero_banner_audit_rows": 0,
      "identifiers_remaining": false,
      "events_preserved": true
    }'::jsonb
    and result ->> 'inventory_digest' ~ '^[a-f0-9]{64}$'
    and (select count(*) from pg_catalog.jsonb_object_keys(result)) = 7,
  'redaction is idempotent and discovers no already-sanitized event twice'
)
from idempotent_redaction;
select extensions.is(
  (public.kc_account_audit_identifier_inventory(
    '00000000-0000-4000-8000-000000000991'
  ) ->> 'identifiers_remaining')::boolean,
  false,
  'database-side postcondition finds zero target UUID values after redaction'
);
select extensions.is(
  public.kc_account_erasure_capabilities() ->> 'audit_identifier_redaction',
  'true',
  'erasure capability gate advertises audit redaction only after migration'
);
select extensions.is(
  (public.kc_account_erasure_capabilities() ->> 'version')::integer,
  5,
  'erasure capability version includes redaction, durable closure, renewable leases and verified identity binding'
);

reset role;

select extensions.is(
  (
    select entity_id::text
    from public.audit_log
    where id = '10000000-0000-4000-8000-000000000991'
  ),
  (
    select entity_id::text
    from audit_redaction_entity_checkpoint
  ),
  'idempotent repair does not rotate the operational entity pseudonym again'
);

select extensions.finish();

rollback;
