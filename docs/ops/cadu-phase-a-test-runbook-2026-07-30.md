# Cadu Phase-A test runbook

Issue: [#748](https://github.com/yandiamantinoBr/kino-campus/issues/748)

## Symptom (before fix)

`Supabase reset, lint and pgTAP` failed in `Prove Phase-A upgrade from linked schema fingerprint` with:

```
ERROR:  CADU_METADATA_CONTRACT_NOT_READY_AFTER_RECONCILIATION
```

`scripts/test-cadu-phase-a-legacy-upgrade.js` simulates the legacy upgrade path: it applies a fixture (the linked project's pre-Cadu fingerprint) plus the four Cadu legacy migrations to a fresh Supabase schema. The probe `kc_cadu_metadata_contract()` then verifies that the resulting schema matches the fail-closed Cadu unit-meta contract.

## Root cause (not Linux-specific)

The probe `20260713184500_cadu_metadata_contract_probe.sql` was authored for a **pre-privacy** schema fingerprint. It expects, among other things:

- the FK `kc_unit_meta_updated_by_fkey` to be `FOREIGN KEY (updated_by) REFERENCES auth.users(id)` (no `ON DELETE SET NULL`);
- the table to have a single permissive SELECT policy `kc_unit_meta_select_public`;
- the table to have only the `kc_unit_meta_touch` trigger (no `kc_active_session_write_guard`);
- the table to have no `kc_active_session_restrictive` policy.

The PR #747 (LGPD/DSR) added 22 privacy migrations. One of them (`20260728183022_data_subject_requests_and_export.sql`) attaches `ON DELETE SET NULL` to the FK and a separate migration adds the active-session guard artifacts. When the CI runs `supabase db reset` before the Phase-A test, the schema is left in the **post-privacy** state. The fixture (the linked-project fingerprint) then ran, but it was not aware of the privacy artifacts: it dropped the `revision` column, the `kc_unit_meta_select_public` policy, and the touch trigger, but **not** the `kc_active_session_write_guard` trigger, the `kc_active_session_restrictive` policy, nor the `ON DELETE SET NULL` suffix on the FK. As a result, the probe saw a hybrid state that did not match either the legacy expectation or the privacy expectation, and `ready` evaluated to `false`.

This reproduces identically on Windows + Docker Desktop and on Linux. The reported "Linux-only" appearance was a misread; the failure was deterministic in any environment where the privacy migrations had been applied before the test.

## Fix

`tests/sql/cadu-phase-a-linked-schema-fixture.sql` now actively reverts the privacy artifacts before the test exercises the four Cadu legacy migrations:

1. `drop trigger if exists kc_active_session_write_guard on public.kc_unit_meta;`
2. `drop policy if exists kc_active_session_restrictive on public.kc_unit_meta;`
3. `drop constraint if exists kc_unit_meta_updated_by_fkey;` + recreate the FK **without** `ON DELETE SET NULL`.
4. Recreate a single permissive SELECT policy `anyone can read kc_unit_meta` (the original linked-project fingerprint had a single permissive SELECT, the four admin policies were a temporary state introduced by the test author and then dropped by `20260713183000`).

The fixture's previous `kc_unit_meta_insert_admin` / `kc_unit_meta_update_admin` / `kc_unit_meta_delete_admin` policies are no longer recreated because `20260713183000` drops them on its first run anyway, and the probe expects the post-`20260713183000` state.

The `20260730120000_align_cadu_metadata_probe_with_phase_a_compat.sql` fix migration becomes redundant in the Phase-A test path (the fixture resets the schema cleanly), but it is still useful for the normal `supabase db reset` flow, so it stays in place.

## Validation

```bash
# 1) Phase-A upgrade proof
npm run test:cadu:phase-a-upgrade
# expected:
#   Phase-A linked-schema upgrade proof passed with preserved metadata and ready contract.

# 2) Phase-A PostgREST role + 409/412 CAS proof
npm run test:cadu:phase-a-postgrest
# expected:
#   Phase-A PostgREST role, named-argument and 409/412 CAS proof passed.

# 3) Full Jest contract + integration suite for the Cadu unit-meta contract
npx jest tests/contract/cadu-metadata-contract-collision-cas.test.js \
        tests/contract/cadu-source-override-collision-cas.test.js \
        tests/contract/cadu-trusted-publisher-helper-restore.test.js \
        tests/contract/cadu-unit-meta-cas-rpc.test.js \
        tests/contract/cadu-unit-meta-readiness-contract.test.js --runInBand
# expected: 5 suites, 18 tests, 0 failures.
```

## Reverting

If a future PR breaks the probe contract, the safest rollback is:

1. revert `tests/sql/cadu-phase-a-linked-schema-fixture.sql`;
2. re-run `npm run test:cadu:phase-a-upgrade` to confirm the legacy fixture + 4 Cadu legacy are still aligned;
3. re-run `npm run test:cadu:phase-a-postgrest` to confirm the PostgREST surface is still aligned.
