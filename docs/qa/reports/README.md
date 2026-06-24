# Reports de QA Ativo

Reports ativos e templates de evidencia. Reports historicos V8/V11/V15 foram movidos para
`docs/archive/qa-legacy/` em V20.

## Conteúdo

| Arquivo | Uso |
|---|---|
| `report-v76-chat-features-backend-2026-06-22.md` | Evidência V76.53 das 3 features de chat em produção (checkmarks, reações emoji, reply/quote) — schema + RPCs + frontend |
| `report-v76-chat-ux-improvements-2026-06-21.md` | Evidência V76.52 das 3 melhorias de UX em /mensagens.html (agrupamento de mensagens, indicador "digitando..." via broadcast efêmero, microinterações) sem migration |
| `report-v76-prod-dev-alignment-2026-06-21.md` | Evidência V76.51 da auditoria de alinhamento produção↔dev: `db pull` confirmou schema idêntico à baseline, sem divergência |
| `report-v76-search-sql-revalidation-2026-06-21.md` | Evidência V76.50 da revalidação SQL pós-reparo: cadeia de migrations destravada, matriz RLS 8/8, regressão p95 ≤20%, mas timeout 1500ms em 50k mantém No-Go para migration |
| `report-v76-ci-playwright-2026-06-21.md` | Evidência V76.48 do CI executando as 83 specs Playwright (chromium) como gate de regressão real, encerrando o modo inventário `--list` |
| `report-v76-migration-baseline-2026-06-21.md` | Evidência V76.47 da baseline consolidada que destrava `supabase db reset` (132 migrations legacy arquivadas, 1 baseline validada em PostgreSQL 17.6 local) |
| `report-v76-docs-hygiene-2026-06-21.md` | Evidência V76.49 da higiene de drift em `docs/index.md`/`_INDEX.md` e do comentário esclarecedor da flag `search.personalization` |
| `report-v76-search-session-standard-order-2026-06-21.md` | Evidência V76.46 do bypass efêmero de personalização por consulta |
| `report-v76-search-sql-local-proof-2026-06-20.md` | Evidência V76.45 da matriz RLS, benchmark 10k/50k, índice rejeitado e rollback R3 em PostgreSQL 17.10 descartável |
| `report-v76-kcapi-adapter-registry-contract-2026-06-19.md` | Evidência V76.31 dos quatro gates comportamentais de `adapter-registry` |
| `report-v76-kcapi-transport-config-contract-2026-06-19.md` | Evidência V76.30 dos quatro gates comportamentais de `transport-config` |
| `report-v76-kcapi-bootstrap-driver-core-dossier-2026-06-19.md` | Evidência V76.29 do dossiê automatizado e No-Go do `bootstrap-driver-core` |
| `report-v76-css-public-shell-baseline-expansion-2026-06-19.md` | Evidência V76.28 da expansão CSS-B.1 para as 12 páginas consumidoras do public shell |
| `report-v76-css-profile-ranking-shell-micro-split-2026-06-19.md` | Evidência V76.27 do micro-split `.kc-profile-rank-badges*` e da correção do baseline público de perfil |
| `report-v76-css-legal-shell-micro-split-2026-06-18.md` | Evidência V76.26 do micro-split `.kc-legal-*` para o CSS público dedicado |
| `report-v76-home-context-density-2026-06-18.md` | Evidência V76.25 da faixa compacta “Sobre o KinoCampus” e do modal contextual na home mobile |
| `report-v76-mobile-context-density-2026-06-18.md` | Evidência V76.24 da faixa compacta e do bottom sheet contextual recolhido nos seis módulos mobile |
| `report-v76-context-sidebar-404-responsive-2026-06-18.md` | Evidência V76.23 do contexto responsivo dos seis módulos, diálogo acessível e reconstrução desktop/mobile da página 404 |
| `report-v76-adsense-public-content-resilience-2026-06-17.md` | Evidência V76.22 de alt contextual, estados vazios públicos, canonical/snippets de produto e gate Search Console/AdSense |
| `_TEMPLATE-authenticated-run.md` | Template V26 para rodada autenticada real com redacao de evidencias |
| `report-v76-cadu-six-image-contract-2026-06-17.md` | Evidência V76.21 da consolidação do limite de seis imagens no pipeline confiável do Cadu |
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
