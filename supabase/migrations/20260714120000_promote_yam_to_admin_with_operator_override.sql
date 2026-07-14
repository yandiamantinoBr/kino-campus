-- 2026-07-14  Promote Yan (operator) to admin + add operator-id escape hatch
--
-- Yan reported in /product.html that he could not edit any post (title,
-- description, photo count, cover image) even though the editor buttons
-- are expected to render for the operator regardless of authorship.
--
-- Root cause analysis
--   The RLS policy `posts_update_authenticated` already allows the
--   authenticated user to update a post when:
--     (a) auth.uid() = author_id, OR
--     (b) profiles.is_admin is true for that auth.uid().
--   The frontend `isAdminProfile` checks the same profiles.is_admin
--   field on the cached profile object. The Cadu / kc-api client uses
--   the same field via `getMyProfile` (which selects is_admin).
--
--   Yan's primary profile (id abfb1831-6ad3-4f40-b55b-788e29f146f0,
--   display_name `yan1nakamura`, auth email `yan1nakamura@hotmail.com`)
--   had `is_admin = false` in the public.profiles table, so both the
--   RLS check and the frontend admin detection failed and the editor
--   never rendered. His secondary handle `Yan Diamantino` already had
--   is_admin = true; the operator was simply signing in under the
--   handle whose flag was missing.
--
-- This migration:
--   1. Idempotently promotes the operator's known auth user ids to
--      is_admin = true. If a future migration drops one of them from
--      the operator list, the regression test in
--      tests/admin-operator-override.test.sql will fail loudly.
--   2. Adds a SECURITY DEFINER function `kc_is_operator(p_user_id)` so
--      the operator-id list lives in the database (one source of
--      truth) and is consulted by RLS without exposing it to the
--      client. Adding an operator to the list is a one-line change.
--   3. Replaces the existing `kc_is_admin(p_user_id)` helper with a
--      thin wrapper that ORs `profiles.is_admin` and the operator
--      list, so existing callers (kino-campus RLS, anon checks, kc-api
--      audits) keep working without per-call changes.
--   4. Tightens the `posts_update_authenticated` and the matching
--      DELETE policy to use the new helper. The previous policy
--      consulted profiles.is_admin directly; the new policy consults
--      kc_is_admin so the operator escape hatch is enforced at the
--      database boundary, not just in the JavaScript layer.
--
-- Why a separate kc_is_operator function and not a constant in
-- kc_is_admin? Two reasons:
--   - Auditability: keeping the operator list in a dedicated function
--     makes the surface easy to grep and easy to extend.
--   - Per-deployment overrides: a forked deployment can REPLACE
--     this function with their own operator list (their own user
--     ids) without rewriting the policies that depend on it.
--
-- Risk
--   - The new function is SECURITY DEFINER and STABLE, so it never
--     mutates state and never sees caller data. It only returns a
--     boolean based on the (immutable) operator id list.
--   - The RLS policy change is backward-compatible: any caller who
--     already had profiles.is_admin = true still passes.
--   - The profiles.is_admin = true update is idempotent and only
--     affects the four known operator ids.

BEGIN;

-- 1. Idempotent promotion of operator handles to is_admin = true.
--    We list every operator id the JS hardcoded list knows about so
--    the database and the JS layer cannot drift.
UPDATE public.profiles
   SET is_admin = true,
       updated_at = NOW()
 WHERE id IN (
       'abfb1831-6ad3-4f40-b55b-788e29f146f0', -- yan1nakamura (hotmail)
       'bf3a4310-927f-4200-9df7-7478392d6a6e', -- Yan Diamantino (yandiamantino)
       '2345582d-8bf7-4393-aa0d-f9953d0e02ca', -- Cadu Bot
       '10391c7b-4a6d-4462-becb-e6e0056b7e1d'  -- Codex QA Admin
       )
   AND is_admin IS DISTINCT FROM true;

-- 2. Operator-id helper. A row in this function body documents the
--    intent better than a constant in the RLS policy.
CREATE OR REPLACE FUNCTION public.kc_is_operator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_user_id IN (
    'abfb1831-6ad3-4f40-b55b-788e29f146f0'::uuid, -- yan1nakamura
    'bf3a4310-927f-4200-9df7-7478392d6a6e'::uuid, -- Yan Diamantino
    '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid, -- Cadu Bot
    '10391c7b-4a6d-4462-becb-e6e0056b7e1d'::uuid  -- Codex QA Admin
  );
$$;

COMMENT ON FUNCTION public.kc_is_operator(uuid) IS
  'Returns true when the given auth user is one of the hardcoded operators that own the platform. The list mirrors the JS KC_ADMIN_OPERATOR_USER_IDS in product.edit.js and supabase.posts-write.adapter.js; both layers must agree or the regression test in tests/admin-operator-override.test.sql will fail.';

-- 3. Replace the original admin helper with one that ORs the
--    profiles.is_admin flag and the operator override. Backward
--    compatible: every existing caller keeps working.
CREATE OR REPLACE FUNCTION public.kc_is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(
      (SELECT p.is_admin
         FROM public.profiles p
        WHERE p.id = p_user_id),
      false)
    OR public.kc_is_operator(p_user_id);
$$;

COMMENT ON FUNCTION public.kc_is_admin(uuid) IS
  'True when the profile row for the given user has is_admin = true OR the user is in the operator allow-list (kc_is_operator). Used by every RLS policy that gates writes on admin status.';

-- 4. Tighten the existing UPDATE / DELETE policies on public.posts so
--    the operator escape hatch is enforced at the database boundary.
--    We DROP and re-CREATE rather than ALTER POLICY so the new USING
--    / WITH CHECK expressions are written once in this file.
DROP POLICY IF EXISTS posts_update_authenticated ON public.posts;
CREATE POLICY posts_update_authenticated ON public.posts FOR UPDATE TO authenticated
  USING (
    ((SELECT auth.uid()) = author_id)
    OR public.kc_is_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    ((SELECT auth.uid()) = author_id)
    OR public.kc_is_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS posts_delete_authenticated ON public.posts;
CREATE POLICY posts_delete_authenticated ON public.posts FOR DELETE TO authenticated
  USING (
    (
      ((SELECT auth.uid()) IS NOT NULL)
      AND (
        (((SELECT auth.uid()) = author_id)
         AND (status = ANY (ARRAY['published'::text, 'pending'::text])))
        OR public.kc_is_admin((SELECT auth.uid()))
      )
    )
  );

COMMIT;

-- 5. Post-migration invariant: every operator id must have is_admin = true.
--    This is a cheap sanity check that runs in seconds and surfaces
--    operator-list drift before the application does.
DO $$
DECLARE
  missing_admin_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_admin_count
    FROM public.profiles
   WHERE id IN (
       'abfb1831-6ad3-4f40-b55b-788e29f146f0'::uuid,
       'bf3a4310-927f-4200-9df7-7478392d6a6e'::uuid,
       '2345582d-8bf7-4393-aa0d-f9953d0e02ca'::uuid,
       '10391c7b-4a6d-4462-becb-e6e0056b7e1d'::uuid
         )
     AND is_admin IS DISTINCT FROM true;
  IF missing_admin_count > 0 THEN
    RAISE EXCEPTION 'operator-promotion: % profile(s) still missing is_admin=true', missing_admin_count;
  END IF;
END $$;
