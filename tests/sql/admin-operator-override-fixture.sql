\set ON_ERROR_STOP on

-- Regression test for the 2026-07-14 /product.html editor regression.
--
-- Yan's primary profile had is_admin = false in public.profiles, which
-- hid the editor buttons in product.edit.js AND failed the RLS UPDATE
-- policy (posts_update_authenticated). The migration
-- 20260714120000_promote_yam_to_admin_with_operator_override.sql
-- introduced:
--   - a SECURITY DEFINER helper public.kc_is_operator(uuid) that
--     returns true for the four hardcoded operator ids;
--   - a thin wrapper public.kc_is_admin(uuid) that ORs the profile
--     flag and the operator helper;
--   - new UPDATE / DELETE policies on public.posts that consult
--     kc_is_admin (so the operator escape hatch is enforced at the
--     database boundary, not just in the JS layer).
--
-- This fixture pins down the contract the migration promises. If a
-- future change breaks any of the assertions below, the operator
-- regression is back and Yan cannot edit any post.

begin;

-- 0. Helper ids (mirror of the JS KC_ADMIN_OPERATOR_USER_IDS list).
do $$
declare
  operator_yam_hotmail  constant uuid := 'abfb1831-6ad3-4f40-b55b-788e29f146f0';
  operator_yam_diam     constant uuid := 'bf3a4310-927f-4200-9df7-7478392d6a6e';
  operator_cadu         constant uuid := '2345582d-8bf7-4393-aa0d-f9953d0e02ca';
  operator_qa_admin     constant uuid := '10391c7b-4a6d-4462-becb-e6e0056b7e1d';
  random_user           constant uuid := '00000000-0000-0000-0000-deadbeef0000';
begin
  -- 1. kc_is_operator must return true for the four operator ids.
  if not public.kc_is_operator(operator_yam_hotmail) then
    raise exception 'admin-operator-override: kc_is_operator(yan1nakamura) is false';
  end if;
  if not public.kc_is_operator(operator_yam_diam) then
    raise exception 'admin-operator-override: kc_is_operator(yandiamantino) is false';
  end if;
  if not public.kc_is_operator(operator_cadu) then
    raise exception 'admin-operator-override: kc_is_operator(cadu) is false';
  end if;
  if not public.kc_is_operator(operator_qa_admin) then
    raise exception 'admin-operator-override: kc_is_operator(qa_admin) is false';
  end if;

  -- 2. kc_is_operator must return false for a random non-operator id.
  if public.kc_is_operator(random_user) then
    raise exception 'admin-operator-override: kc_is_operator returned true for a random uuid';
  end if;

  -- 3. kc_is_admin must wrap the profile flag and the operator list.
  --    The migration's UPDATE block is idempotent; the four operator
  --    profiles should now have is_admin = true. We re-assert the
  --    flag here so a manual flip-back to false is also caught.
  if (select is_admin from public.profiles where id = operator_yam_hotmail) is distinct from true then
    raise exception 'admin-operator-override: profile yan1nakamura still has is_admin != true';
  end if;
  if (select is_admin from public.profiles where id = operator_yam_diam) is distinct from true then
    raise exception 'admin-operator-override: profile yandiamantino still has is_admin != true';
  end if;

  -- 4. kc_is_admin must agree with the operator list.
  if not public.kc_is_admin(operator_yam_hotmail) then
    raise exception 'admin-operator-override: kc_is_admin(yan1nakamura) is false even after promotion';
  end if;
  if not public.kc_is_admin(operator_yam_diam) then
    raise exception 'admin-operator-override: kc_is_admin(yandiamantino) is false even after promotion';
  end if;
end $$;

-- 5. RLS policy must exist with the new USING expression. The
--    migration drops and recreates the policy, so we re-fetch it to
--    guarantee the helper is the source of truth. We use pg_policies
--    (built-in catalog view) instead of an admin-only RPC.
do $$
declare
  using_expr text;
begin
  select polqual into using_expr
    from pg_policy
   where polrelid = 'public.posts'::regclass
     and polname = 'posts_update_authenticated';
  if using_expr is null then
    raise exception 'admin-operator-override: posts_update_authenticated policy not found';
  end if;
  -- The new expression must reference kc_is_admin (not the old
  -- profiles.is_admin inline subquery) so the operator override
  -- flows through. We check for the substring rather than the full
  -- text so the test is stable against cosmetic rewrites.
  if position('kc_is_admin' in using_expr) = 0 then
    raise exception 'admin-operator-override: posts_update_authenticated USING expression does not reference kc_is_admin (got: %)', using_expr;
  end if;
end $$;

commit;

-- The contract is intact if we reached this point. The fixture is a
-- no-op transaction; rolling forward the migration that adds the
-- operator helpers is what makes the assertions true.
select 'admin-operator-override: contract holds' as status;
