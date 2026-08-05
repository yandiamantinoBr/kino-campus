# Report — Performance Advisor cleanup (2026-08-05)

**Project:** `wacyrkwhkvzwkqpolrbg`  
**Inputs:**  
- `… - 2 Warnings.csv` (2 WARN)  
- `… 77 info.csv` (77 INFO)

## Summary

| Class | Count | Action |
|-------|------:|--------|
| WARN `auth_rls_initplan` | 1 | Fixed (hero_banners admin SELECT) |
| WARN `multiple_permissive_policies` | 1 | Fixed (merge authenticated SELECTs) |
| INFO `unindexed_foreign_keys` | 16 | Fixed (covering indexes) |
| INFO `unused_index` | 60 | **Kept** (operational / cold-path indexes) |
| INFO `auth_db_connections_absolute` | 1 | Fixed via Auth config (`percent`) |

## WARN details

### 1. `auth_rls_initplan` on `banners_admin_select_all`

Policy used `kc_is_admin(auth.uid())` / `kc_is_admin_impl(auth.uid())`, re-evaluated per row.

### 2. `multiple_permissive_policies` on `hero_banners` SELECT for `authenticated`

Both `banners_admin_select_all` and `banners_anon_authenticated_select_active` applied to authenticated.

### Fix

```text
anon          → banners_select_active_anon          USING (is_active = true)
authenticated → banners_select_authenticated        USING (
                  is_active = true
                  OR public.kc_is_admin((select auth.uid()))
                )
```

Visitor contract from `20260804003000` is preserved: anon never joins `profiles`.

## INFO: unindexed FKs

Added 16 btree indexes on FK columns in `public` and `kc_private` (erasure/export/help privacy surfaces).

## INFO: unused_index (60) — why not drop

Advisor marks indexes with zero hits in the current stats window. On this project many cover:

- chat (`chat_messages_*`, `chat_conversations_*`, `chat_read_state_*`)
- moderation/reports
- feed ranking (`posts_feed_module_highlight_idx`)
- flood limits, ads admin, privacy analytics, LGPD erasure queues

These are **cold but intentional**. Dropping them would:

1. slow rare admin/chat queries without measurable free-tier write gains;
2. reintroduce unindexed FK risk on some paths;
3. be hard to reverse under load later.

Revisit after a multi-week production window with `pg_stat_user_indexes` evidence, not on a single export snapshot.

## INFO: auth_db_connections_absolute

Auth was on absolute `db_max_pool_size = 10` connections. Switched to percentage allocation so pool scales with instance size.

## Migration

`supabase/migrations/20260805140000_perf_advisor_hero_rls_and_fk_indexes.sql`
