# v76 — DB load relief (2026-07-11)

## Incident

Production Kino Campus Supabase project `wacyrkwhkvzwkqpolrbg` entered a failure mode where:

- Management health reported `db` **UNHEALTHY** (`Failed to connect to database`)
- REST `GET /rest/v1/posts?select=id&limit=1` timed out (0 bytes)
- Edge logs (~1h window): **503×212**, **504×108**, **statement_timeout 57014×127**, connection lost / SSL EOF
- Auth GoTrue process often still answered `/auth/v1/health` while PostgREST could not open Postgres connections
- Project had been restored from a paused state; restore message indicated services may take time

Network isolation: Google/GitHub/Vercel APIs OK from the same machine — failure is project DB, not local ISP.

## Root causes (layered)

### A. Concurrent homepage stampede

`index.controller` previously ran in parallel:

- `kc_get_feed_cursor` (feed)
- `kc_get_top_contributors` (ranking)
- `kc_home_category_post_counts` with **force: true**
- personal + community panels (re-reading category counts/affinity)
- plus banners, personalized tabs, notifications, privacy RPCs

Cold load ≈ **8–15** concurrent DB-touching operations.

### B. Module filter catalogs used full embeds

`compra-venda`, `moradia`, `oportunidades`, `achados-perdidos` called `getPosts` with:

- limit **100** × up to **20 pages** (×2 modules on marketplace)
- select embeds: `profiles`, `post_media`, `comments(count)`

These catalogs only need filter metadata (category/price/date), not full card embeds. Card rail already uses `getFeedCursor` (good).

### C. Background write load

- `kc-refresh-highlight-scores` scheduled **hourly** (full recompute of recent published posts)
- notification outbox dispatcher every **5 minutes** (startup timeouts under pressure)

### D. Index gaps for real feed predicates

Common filters:

`legacy_id IS NULL AND status IN ('published','closed')` + sort columns

Existing indexes covered author, status alone, status+module+category, highlight global — not partial feed-shaped composites.

## Remediation shipped (code)

1. **`getPosts` hard cap** limit ≤ 50; **`light: true`** select without embeds
2. Module **`fetchAll`** → light mode, max 4 pages × 50
3. Home **bootstrap sequential**: feed first, categories without force, ranking deferred via idle callback
4. Home category fallback already uses light REST columns (not full getPosts)
5. Events calendar limit 500 → 120
6. Supabase client **18s fetch timeout** to stop hung tabs from stacking
7. Gate no-module getPosts fallback to page=1 and limit≤12 only
8. Cache-bust script query `?v=8.6.6` on touched assets

## Remediation shipped (SQL migration)

File: `supabase/migrations/20260711060000_db_load_relief_feed_indexes_cron.sql`

- Partial indexes for module/all-module feed sorts
- Reschedule highlight cron to every **6 hours** (`15 */6 * * *`)

Apply when DB accepts connections:

```bash
supabase link --project-ref wacyrkwhkvzwkqpolrbg
supabase db push
# or run the migration SQL in Dashboard SQL editor
```

## Operational checklist (when DB recovers)

1. Dashboard → Restart project if still UNHEALTHY after 30+ min restore
2. Apply migration above
3. Confirm: `select 1` and `posts?select=id&limit=1` → 200 in <1s
4. Confirm cron: `select * from cron.job where jobname like 'kc-%'`
5. Consider compute upgrade if free Nano continues to thrash under normal traffic
6. Avoid opening many admin dashboards (they still use large limits)

## Non-goals / safety

- No RLS weakening
- No change to feed card contract (`getFeedCursor` remains primary rail)
- Filter UX may see fewer historical posts in sidebar catalogs (cap 200) — acceptable vs platform outage
