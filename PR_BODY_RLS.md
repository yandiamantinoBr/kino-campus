Closes the follow-up audit I committed in PR #799 (`hero-banners-anon-rls-2026-08-04.md`). Found 3 more policies with the same `profiles.is_admin`-in-USING anti-pattern on `public.reports` and `public.audit_log`:

```
1. public.reports / reports_select_admins     (FOR SELECT, TO public)   <-- worst: anon-reachable
2. public.reports / reports_update_admin      (FOR UPDATE, TO authenticated)
3. public.audit_log / audit_log_select_admin  (FOR SELECT, TO authenticated)
```

Pre-fix live REST probe (anon key):
```
GET /rest/v1/reports?select=id&limit=1
  -> 42501 'permission denied for table reports'
```

Fix: drop the broken policies, add the `kc_is_admin()`-based replacements and a `reporter_id = auth.uid()` self-read policy for reports. `audit_log_select_admin` is refactored to the same `kc_is_admin()` shape for consistency. No policy on a public/anon-reachable table now drags `profiles.is_admin` into the query.

Test: `tests/integration/reports-rls-public-select.test.js` (pinned `@jest-environment node`, same pattern as PR #799). The test fires the live REST probe and asserts no 42501 against profiles; the `pg_policies` shape check is gated by `SUPABASE_SERVICE_KEY` and runs only when an operator has provisioned one for the test env.

NB: the live database has not been migrated yet because the `SUPABASE_ACCESS_TOKEN` in the local env is expired. Apply the migration through the Supabase dashboard SQL editor or via a fresh token, and the test flips from red to green.
