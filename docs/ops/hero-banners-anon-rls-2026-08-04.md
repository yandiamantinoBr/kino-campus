# kc-hero-carousel — visitor anon RLS incident (2026-08-04)

## Summary

Visitors (logged-out, anon role) saw the old static mockup slides in the
home hero carousel instead of the live `hero_banners` rows from Supabase.
Logged-in users saw the correct active banners.

## Root cause

The legacy `banners_read` policy on `public.hero_banners` was:

```sql
create policy banners_read on public.hero_banners
  for select to public
  using (
    (is_active = true)
    or exists (
      select 1 from profiles
      where profiles.id = (select auth.uid()) and profiles.is_admin = true
    )
  );
```

For the anon role `auth.uid()` is `null`, so the planner rewrote the
inner query as a join against `profiles`. `profiles` is RLS-locked, and
the planner tried to evaluate the join under the anon role, which is not
allowed to read `profiles`. Postgres raised:

```
42501 permission denied for table profiles
```

The whole `banners_read` policy became unusable for anon. The JS layer
(`assets/js/features/kc-banners.js`) silently fell back to the static
mockup slides baked into `index.html`, which is the bug the user
reported.

## Fix

Two PRs shipped together:

- **PR #798** (`1d87758e`): frontend cleanup. Removed the static mockup
  slides from `index.html` (empty loading shell only), updated
  `kc-banners.js` to always load `is_active=true` for anon and
  authenticated users, with a `localStorage` cache for visitors, retry
  on slow boot, and graceful empty-state collapse.
- **PR #799** (`8fda59cb`): backend RLS fix.
  `supabase/migrations/20260804003000_hero_banners_public_select_split.sql`
  drops `banners_read` and creates:
  - `banners_anon_authenticated_select_active` (`to anon, authenticated`,
    `using (is_active = true)`, no profiles dependency)
  - `banners_admin_select_all` (`to authenticated`,
    `using (public.kc_is_admin(auth.uid()))` — admin check goes through
    the existing `SECURITY DEFINER` helper, so it never drags `profiles`
    into the query).

The other `banners_*_admin` policies already route through
`kc_is_admin(...)` and need no change. The `kc_active_session_restrictive`
policy stays untouched and only applies to authenticated callers.

## Regression test

`tests/integration/hero-banners-anon-rls.test.js` (added in PR #799).
Runs the same anon REST request `kc-banners.js` makes in production and
asserts a 200 with the live catalog. The file pins
`/** @jest-environment node */` at the top so `fetch` is the Node 18+
global (the repo default is jsdom, which does not expose `fetch`).

## Verification

After merge + Vercel deploy:

```
GET /rest/v1/hero_banners?is_active=eq.true&order=sort_order.asc
Authorization: Bearer <anon key>
→ 200 OK
[
  {"id":"cdbf...","title":"Lançamento do KinoCampus na UFG","sort_order":1,"is_active":true},
  {"id":"9b18...","title":"🌿 Festival Flore-Ser — Saberes, Cuidados e Meio Ambiente na UFG","sort_order":1,"is_active":true}
]
```

## Lessons

- A single combined RLS policy that mixes "anyone can read active rows"
  with "admins can read everything" is fragile: the admin branch can
  drag a locked table into a query that should never need it, and
  Postgres raises 42501 on the *inner* table, not the *outer* policy.
  Keep "public-by-condition" and "admin-only" as two separate policies.
- Anon role + `auth.uid() is null` is the failure mode. Always sanity
  check new RLS policies with the anon role, not just authenticated
  admin tests.
- The kino-campus jsdom jest default does not expose `fetch`. For any
  test that needs to talk to a real HTTP endpoint, pin
  `/** @jest-environment node */` at the top of the file.

## Followups

- Audit the other RLS policies on `hero_banners_*` tables (events,
  feed, etc.) for the same anti-pattern: a single policy that joins a
  locked table to gate an "admin" branch.
- Add a small CI check that fires a few `select` queries with the anon
  role against every public table and flags any 42501, so this kind of
  policy regresses loudly.
