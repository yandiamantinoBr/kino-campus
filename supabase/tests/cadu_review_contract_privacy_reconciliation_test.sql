begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

select extensions.is(
  public.kc_cadu_review_contract() ->> 'contractVersion',
  'cadu-institutional-review-v1',
  'review readiness keeps the deployed contract version'
);

select extensions.ok(
  (public.kc_cadu_review_contract() ->> 'ready')::boolean,
  'privacy-compatible review contract is ready'
);

select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewTable}')::boolean,
  'review table accepts the erasure-safe nullable requester'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewConstraints}')::boolean,
  'review constraints accept only the erasure-safe FK and state definitions'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewIndexes}')::boolean,
  'review indexes remain exact'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewRlsPolicy}')::boolean,
  'review RLS includes admin read and active-session restriction'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewTableAcl}')::boolean,
  'review table grants remain least privilege'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewGuardTrigger}')::boolean,
  'review table has both editorial and active-session guards'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewCreateRpc}')::boolean,
  'review create RPC remains exact'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewResolveRpc}')::boolean,
  'review resolve RPC remains exact'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewDependencies}')::boolean,
  'review dependencies include hardened admin and session helpers'
);

drop policy kc_active_session_restrictive
  on public.cadu_institutional_source_reviews;

select extensions.ok(
  not (public.kc_cadu_review_contract() ->> 'ready')::boolean,
  'review contract fails closed when the session policy is absent'
);
select extensions.ok(
  not (public.kc_cadu_review_contract() #>> '{checks,reviewRlsPolicy}')::boolean,
  'review policy check identifies the missing session policy'
);
select extensions.ok(
  (public.kc_cadu_review_contract() #>> '{checks,reviewTableAcl}')::boolean,
  'unrelated ACL evidence remains independently observable'
);

select * from extensions.finish();

rollback;
