# Reports de QA Ativo

Reports ativos e templates de evidencia. Reports historicos V8/V11/V15 foram movidos para
`docs/archive/qa-legacy/` em V20.

## Conteúdo

| Arquivo | Uso |
|---|---|
| `_TEMPLATE-authenticated-run.md` | Template V26 para rodada autenticada real com redacao de evidencias |
| `report-v76-css-chat-shortcut-micro-split-2026-06-15.md` | Evidência V76 CSS-C.3 do micro-split do atalho global de mensagens de `styles.css` para `kc-chat-shortcut.css` |
| `report-v76-notify-admin-reports-threshold-deploy-2026-06-15.md` | Evidência V76 do deploy controlado da Edge Function `notify-admin-reports-threshold`, mantendo alerta em No-Go/fail-closed |
| `report-v76-css-admin-overlap-micro-split-2026-06-15.md` | Evidência V76 CSS-C.2 do micro-split do overlap admin remanescente de `styles.css` para `admin-shell.css` |
| `report-v76-css-admin-nav-micro-split-2026-06-15.md` | Evidência V76 CSS-C do micro-split da navegação admin de `styles.css` para `admin-shell.css` |
| `report-v76-kcapi-post-mutation-bridge-extraction-2026-06-15.md` | Evidência V76 da extração JS-I.3 da ponte de mutação/freshness de posts para `window._KCAPI.postsWrite` |
| `report-v76-kcapi-notification-fallbacks-extraction-2026-06-15.md` | Evidência V76 da extração JS-I.2 dos fallbacks canônicos de notificação para `window._KCAPI.notifications` |
| `report-v76-kcapi-external-access-extraction-2026-06-13.md` | Evidência V76 da extração JS-I.1 de external access admin para `window._KCAPI.help` |
| `report-v76-kcapi-residual-inventory-2026-06-12.md` | Evidência V76 do inventário residual JS-I da fachada `KCAPI` sem alteração de runtime |
| `report-v76-css-visual-baseline-2026-06-12.md` | Evidencia V76 do baseline CSS-B visual/cascade antes de split de `styles.css` |
| `report-v76-css-ownership-inventory-2026-06-12.md` | Evidencia V76 do inventario CSS-A de ownership de `styles.css` |
| `report-v76-kcapi-ratings-normalize-extraction-2026-06-12.md` | Evidencia V76 da extracao dos normalizadores `normalizeUserRating*` para `window._KCAPI.ratings` |
| `report-v76-kcapi-posts-normalize-extraction-2026-06-12.md` | Evidencia V76 da extracao de `KCAPI.normalizePost` para `window._KCAPI.postsNormalize` |
| `report-v76-kcapi-normalize-post-snapshot-2026-06-12.md` | Evidencia V76 do snapshot pre-extracao de `KCAPI.normalizePost` |
| `report-v76-kcapi-authors-extraction-2026-06-12.md` | Evidencia V76 da extracao de autores mock/indices para `window._KCAPI.authors` |
| `report-v76-kcapi-filters-extraction-2026-06-12.md` | Evidencia V76 da extracao de filtros avancados/date presets para `window._KCAPI.filters` |
| `report-v76-kcapi-session-extraction-2026-06-12.md` | Evidencia V76 da extracao de `KCSessionStore`/`KCPostFreshness` para `window._KCAPI.session` |
| `report-v76-kcapi-diagnostics-extraction-2026-06-12.md` | Evidencia V76 da extracao de diagnostics de create-post para `window._KCAPI.diagnostics` |
| `report-v76-kcapi-public-surface-2026-06-12.md` | Snapshot V76 da superficie publica `window.KCAPI` e blocos residuais antes de decomposicao JS |
| `report-v75-notification-provider-status-2026-06-11.md` | Evidencia V75 do estado real dos providers Resend/Twilio no Supabase remoto |
| `report-v75-supabase-auth-password-protection-2026-06-11.md` | Evidencia V75 de `password_hibp_enabled=false` no Supabase Auth remoto |
| `report-v75-supabase-unaccent-extension-schema-2026-06-12.md` | Evidencia V75 de `unaccent` instalado no schema `extensions` no Supabase remoto |
| `report-v75-generated-output-cleanup-2026-06-11.md` | Evidencia V75 da remocao de artefatos gerados do indice Git |
| `report-v75-vercel-cache-control-2026-06-11.md` | Evidencia V75 de cache efetivo para sitemap e Open Graph na Vercel |

## Padrão de entrada

Novos relatórios seguem o padrão: `report-v26-auth-runN.md` ou `report-vX.Y.Z-runN.md`.

## Estado V26

- O runbook principal está em `../v25-real-environment-qa-runbook.md`.
- O checklist ativo está em `../e2e-checklist.md`.
- O plano-fonte de QA autenticado está em `../v19-authenticated-qa-plan.md`.
- Reports antigos continuam preservados em `../../archive/qa-legacy/`.
- Nenhum report deve conter token, senha, magic link completo, service role key, header sensível ou URL assinada.
