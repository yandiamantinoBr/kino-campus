# Report de QA — Security Advisor 0028/0029 INVOKER wrappers (2026-08-05)

**Projeto:** `wacyrkwhkvzwkqpolrbg` (Kino Campus)  
**Entrada:** `Supabase Performance Security Lints (wacyrkwhkvzwkqpolrbg).csv` (34 WARNs)  
**Migration:** `supabase/migrations/20260805120000_security_definer_advisor_invoker_wrappers.sql`

## Resumo dos avisos

| Lint | Qtde | Significado |
|------|------|-------------|
| `anon_security_definer_function_executable` | 13 | `anon` pode `EXECUTE` em função `SECURITY DEFINER` no schema exposto |
| `authenticated_security_definer_function_executable` | 21 | idem para `authenticated` |

Não havia avisos de Performance neste export — só Security.

## Causa raiz

O Security Advisor marca **toda** função `SECURITY DEFINER` em schema exposto (`public`) com `EXECUTE` para `anon`/`authenticated`, **mesmo quando o design é intencional** (Help guest, ratings, pre-request, helpers de RLS).

Revogar `EXECUTE` quebraria o produto. Converter o corpo para `SECURITY INVOKER` sem privilégio elevado quebraria inserts/leituras protegidas por RLS.

## Estratégia (padrão já usado no KinoCampus)

Mesmo padrão de:

- `20260714141147_move_analytics_definers_private.sql`
- `20260707000000_security_linter_fixes.sql` (chat)
- `20260710164556_preserve_admin_banner_invoker_boundary.sql`

1. Corpo privilegiado → `kc_private.*_impl` (`SECURITY DEFINER`)
2. Nome público estável → facade `SECURITY INVOKER` que só delega
3. `GRANT EXECUTE` no worker privado **apenas** às roles que chamam a facade
4. `kc_private` **não** está nos schemas expostos do PostgREST → não vira `/rest/v1/rpc/...`

## Funções cobertas (as 21 únicas do CSV)

| RPC pública | Roles públicas | Worker privado |
|-------------|----------------|----------------|
| `kc_is_admin` / `kc_is_operator` | anon + authenticated | `*_impl` |
| `kc_check_post_limit` | authenticated | `*_impl` |
| `kc_admin_list_banners` / `kc_admin_banner_audit` | authenticated | `*_impl` |
| `kc_get_user_rating_summary` | anon + authenticated | `*_impl` |
| `kc_get_user_rating_state` | authenticated | `*_impl` |
| `kc_get_profile_access_state` | anon + authenticated | `*_impl` |
| `kc_home_category_post_counts` | anon + authenticated | `*_impl` |
| `kc_track_coupon_click` / `kc_track_share` | anon + authenticated | `*_impl` |
| affinity track/list/merge | authenticated | `*_impl` |
| `kc_mark_invite_used` | authenticated | `*_impl` |
| `kc_enforce_active_session_pre_request` | anon + authenticated + authenticator | `*_impl` |
| Help create / claim / v2 | anon + authenticated | workers já existentes |
| Privacy help create/recover | anon + authenticated | workers já existentes |

## O que **não** muda

- Nomes/assinaturas/contratos dos RPCs do frontend e Edge
- Checagens internas (`kc_is_admin`, fail-closed admin, rate limits de engajamento)
- Wiring `pgrst.db_pre_request` no role `authenticator`
- Helpers internos (base de idempotência Help) que **não** são entrypoints de facade

## Testes

- `supabase/tests/security_definer_advisor_invoker_wrappers_test.sql` (pgTAP)
- `tests/structure/security-definer-advisor-invoker-wrappers.test.js`
- Ajuste de expectativas em `help_privacy_submission_idempotency_test.sql` (facades passam a INVOKER; workers privados abrem EXECUTE para as roles da facade, sem exposição REST)

## Verificação pós-deploy

1. Aplicar migration em produção / preview DB
2. No Dashboard → Database → Security Advisor → re-run
3. Esperado: os 34 WARNs 0028/0029 listados no CSV **somem**
4. Smoke:
   - Home anônima (tabs de contagem de categoria)
   - Share / coupon click
   - Help guest + privacy help
   - Admin banners
   - Login + `kc_check_post_limit` no create-post

## Referências

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- `docs/qa/reports/report-v76-advisor-security-fix-2026-06-22.md` (precedente: revoke em trigger-only)
