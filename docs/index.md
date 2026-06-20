# KinoCampus - Documentacao Tecnica

## Baseline atual

- release consolidada: `v75.1.0`
- linha de trabalho atual: `v76.38` (snapshot verificável e lazy runtime sob flag desligada, runtime frontend `8.6.1` inalterado)
- branch-base operacional: `kinocampus-V75.0-foundations`
- documento historico da v75: [../RELATORIO-KINOCAMPUS-V75.md](../RELATORIO-KINOCAMPUS-V75.md)

## Documentos canonicos

| Arquivo | Uso principal |
|---|---|
| [architecture.md](./architecture.md) | arquitetura atual do frontend, camadas, hotspots, contagens e regras de equivalencia |
| [architecture/repository-structure.md](./architecture/repository-structure.md) | estrutura atual do repositório pós-V22, reancorada em v76.31 |
| [architecture/module-catalog.md](./architecture/module-catalog.md) | catalogo de ~130 modulos JS com namespace, paginas e dependencias *(v16.3.0-v16.4.0)* |
| [architecture/controllers-catalog.md](./architecture/controllers-catalog.md) | catalogo de 48 controllers com responsabilidade e KCAPI calls *(v16.5.0; contagem v75.1)* |
| [architecture/script-loading-reference.md](./architecture/script-loading-reference.md) | ordem de carregamento de scripts em 26 HTMLs *(v16.6.0; contagem v76.6)* |
| [architecture/data-flow-guide.md](./architecture/data-flow-guide.md) | fluxo de dados ponta a ponta: usuario -> controller -> KCAPI -> adapter -> Supabase *(v16.7.0)* |
| [architecture/ai-development-guide.md](./architecture/ai-development-guide.md) | guia de comportamento para IA: leia antes de qualquer modificacao *(v16.8.0, reancorado em V75)* |
| [architecture/test-strategy.md](./architecture/test-strategy.md) | estratégia de 188 suites: onde adicionar testes, regras de manutenção *(contagem v76.38)* |
| [architecture/css-architecture.md](./architecture/css-architecture.md) | CSS em produção, ownership de `styles.css`, baseline CSS-B.1/C e `future-split/` *(v76.28)* |
| [api-contract.md](./api-contract.md) | contrato publico da `KCAPI`, metodos expostos e semantica de retorno |
| [db-schema.md](./db-schema.md) | tabelas, politicas, indices, storage, cron jobs e notas de estado do banco |
| [rpc-catalog.md](./rpc-catalog.md) | catalogo de RPCs, triggers e funcoes PostgreSQL usadas pelo app |
| [module-schemas.md](./module-schemas.md) | schemas de criacao e metadados dos 6 modulos publicos |
| [env-vars.md](./env-vars.md) | build-time, runtime, `KC_ENV`, Supabase e observacoes de drift de versao |
| [design-system.md](./design-system.md) | tokens visuais, componentes CSS, popovers e convencoes responsivas |

## Documentos operacionais complementares

| Arquivo | Uso principal |
|---|---|
| [../README.md](../README.md) | visao executiva do projeto, stack, setup, fluxo operacional e estado da release |
| [../CHANGELOG.md](../CHANGELOG.md) | historico consolidado de releases e hotfixes |
| [../RELATORIO-KINOCAMPUS-V75.md](../RELATORIO-KINOCAMPUS-V75.md) | relatorio historico do patch PUBLIC-A11Y kc-ranking decorative icons da v75 |
| [../RELATORIO-KINOCAMPUS-V74.md](../RELATORIO-KINOCAMPUS-V74.md) | patch PUBLIC-A11Y admin-reports decorative icons da v74 |
| [../RELATORIO-KINOCAMPUS-V73.md](../RELATORIO-KINOCAMPUS-V73.md) | patch PUBLIC-A11Y kc-comments decorative icons da v73 |
| [../RELATORIO-KINOCAMPUS-V72.md](../RELATORIO-KINOCAMPUS-V72.md) | patch PUBLIC-A11Y admin dashboard controller decorative icons da v72 |
| [../RELATORIO-KINOCAMPUS-V71.md](../RELATORIO-KINOCAMPUS-V71.md) | patch PUBLIC-A11Y admin dashboard charts decorative icons da v71 |
| [archive/relatorios/_INDEX.md](./archive/relatorios/_INDEX.md) | relatorios historicos arquivados V9, V11, V13-V70 |
| [planning/_INDEX.md](./planning/_INDEX.md) | indice dos planos ativos e inventarios pendentes |
| [archive/_INDEX.md](./archive/_INDEX.md) | indice geral do arquivo historico com ~85 docs |
| [planning/v35-css-readiness-ledger.md](./planning/v35-css-readiness-ledger.md) | pre-requisitos para split CSS, ajustes visuais e rollback |
| [planning/v36-implementation-readiness-roadmap.md](./planning/v36-implementation-readiness-roadmap.md) | ordem segura para transformar readiness em implementacao futura |
| [planning/v37-functional-entry-gate.md](./planning/v37-functional-entry-gate.md) | gate de entrada para qualquer versao funcional futura |
| [planning/v38-rollback-evidence-gate.md](./planning/v38-rollback-evidence-gate.md) | gate de evidencia de rollback antes de mudancas funcionais |
| [planning/v39-functional-candidate-matrix.md](./planning/v39-functional-candidate-matrix.md) | matriz de candidatos funcionais para primeira implementacao futura |
| [planning/v40-auth-callback-preimplementation-dossier.md](./planning/v40-auth-callback-preimplementation-dossier.md) | dossie pre-implementacao para signup/callback real |
| [planning/v41-profile-avatar-preimplementation-dossier.md](./planning/v41-profile-avatar-preimplementation-dossier.md) | dossie pre-implementacao para avatar/profile storage |
| [planning/v42-admin-moderation-preimplementation-dossier.md](./planning/v42-admin-moderation-preimplementation-dossier.md) | dossie pre-implementacao para admin/moderacao |
| [planning/v43-notification-provider-preimplementation-dossier.md](./planning/v43-notification-provider-preimplementation-dossier.md) | dossie pre-implementacao para provider sandbox email/WhatsApp |
| [planning/v44-search-fts-preimplementation-dossier.md](./planning/v44-search-fts-preimplementation-dossier.md) | dossie pre-implementacao para unaccent/FTS isolado |
| [planning/v45-css-small-change-preimplementation-dossier.md](./planning/v45-css-small-change-preimplementation-dossier.md) | dossie pre-implementacao para ajuste CSS pequeno |
| [planning/v46-public-a11y-preimplementation-dossier.md](./planning/v46-public-a11y-preimplementation-dossier.md) | dossie pre-implementacao para copy/a11y/i18n pontual |
| [planning/v47-functional-readiness-consolidation.md](./planning/v47-functional-readiness-consolidation.md) | consolidacao de readiness e gate de selecao para primeira implementacao funcional |
| [planning/v49-functional-scope-freeze.md](./planning/v49-functional-scope-freeze.md) | freeze de escopo antes da primeira implementacao funcional |
| [planning/v50-functional-implementation-intake.md](./planning/v50-functional-implementation-intake.md) | intake documental antes de abrir a primeira branch funcional |
| [planning/v51-functional-no-go-register.md](./planning/v51-functional-no-go-register.md) | registro de No-Go quando gates/evidencias bloquearem implementacao |
| [planning/v52-functional-gate-traceability.md](./planning/v52-functional-gate-traceability.md) | matriz de rastreabilidade dos gates antes da branch funcional |
| [planning/v53-functional-patch-manifest.md](./planning/v53-functional-patch-manifest.md) | manifesto de filescope/teste/rollback antes do primeiro patch funcional |
| [planning/v76-hotspot-decomposition-plan.md](./planning/v76-hotspot-decomposition-plan.md) | plano de decomposição segura dos hotspots `kc-api.client.js` e `styles.css`, atualizado após JS-I.4 |
| [planning/v76-kcapi-residual-inventory.md](./planning/v76-kcapi-residual-inventory.md) | inventário residual JS-I da fachada `KCAPI`, incluindo o No-Go automatizado de JS-I.4 |
| [planning/v76-kcapi-bootstrap-driver-core-dossier.md](./planning/v76-kcapi-bootstrap-driver-core-dossier.md) | dossiê JS-I.4–JS-I.6 dos cinco domínios, 8 gates cobertos e 7 pendentes |
| [planning/v76-css-ownership-inventory.md](./planning/v76-css-ownership-inventory.md) | inventário CSS-A/C de ownership de `styles.css` após os micro-splits admin e chat shortcut |
| [planning/v76-css-visual-baseline.md](./planning/v76-css-visual-baseline.md) | baseline CSS-B/C visual/cascade antes/depois de micro-splits de `styles.css` |
| [planning/v76-search-personalization-architecture-plan.md](./planning/v76-search-personalization-architecture-plan.md) | plano por fases para busca orientada ao schema, preferências, privacidade, métricas e rollback |
| [ops/vercel-supabase-invariants.md](./ops/vercel-supabase-invariants.md) | invariantes operacionais entre Vercel, Supabase, build e deploy |
| [ops/adsense-search-console-readiness-runbook.md](./ops/adsense-search-console-readiness-runbook.md) | gate operacional para deploy, inspeção de URLs e revisão AdSense sem ativação automática |
| [audits/README.md](./audits/README.md) | indice de auditorias tecnicas pontuais (read-only + validacao contra producao) |
| [audits/audit-v3-actual-state-2026-06-11.md](./audits/audit-v3-actual-state-2026-06-11.md) | V3 - comparacao entre V1/V2 e o estado real apos 9 PRs mergeados em 72h (2026-06-11) |
| [ops/v28-unaccent-fts-dependency-audit.md](./ops/v28-unaccent-fts-dependency-audit.md) | auditoria estatica de dependencias `unaccent`/FTS antes de migration |
| [ops/v29-supabase-advisor-evidence-checklist.md](./ops/v29-supabase-advisor-evidence-checklist.md) | checklist de evidencias Supabase Advisor sem secrets |
| [ops/v30-notification-provider-sandbox-checklist.md](./ops/v30-notification-provider-sandbox-checklist.md) | checklist de sandbox/go-live para providers de email e WhatsApp |
| [ops/v48-external-evidence-request-pack.md](./ops/v48-external-evidence-request-pack.md) | pacote de solicitacao/redacao de evidencias externas sem secrets |
| [ops/v75-token-rotation-runbook.md](./ops/v75-token-rotation-runbook.md) | runbook de rotacao e mitigacao de tokens locais sem registrar valores |
| [qa/README.md](./qa/README.md) | mapa dos artefatos de QA e referencia rapida de validacao |
| [qa/reports/report-v76-search-registry-lazy-runtime-2026-06-20.md](./qa/reports/report-v76-search-registry-lazy-runtime-2026-06-20.md) | evidência V76.38 do snapshot, paridade e rede zero sob flag desligada |
| [qa/reports/report-v76-search-temporal-shadow-benchmark-2026-06-20.md](./qa/reports/report-v76-search-temporal-shadow-benchmark-2026-06-20.md) | evidência V76.37 de tempo/status, intenção e benchmark sintético por módulo |
| [qa/reports/report-v76-search-shadow-pipeline-2026-06-20.md](./qa/reports/report-v76-search-shadow-pipeline-2026-06-20.md) | evidência V76.36 do pipeline shadow, filtros estruturados e saída sanitizada |
| [qa/reports/report-v76-search-query-parser-offline-2026-06-20.md](./qa/reports/report-v76-search-query-parser-offline-2026-06-20.md) | evidência V76.35 do parser offline e métricas do corpus dourado |
| [qa/reports/report-v76-local-search-structured-projection-2026-06-20.md](./qa/reports/report-v76-local-search-structured-projection-2026-06-20.md) | evidência V76.34 da projeção estruturada local sob flag desligada |
| [qa/reports/report-v76-search-field-registry-contract-2026-06-19.md](./qa/reports/report-v76-search-field-registry-contract-2026-06-19.md) | evidência V76.33 do registro derivado, corpus dourado e políticas de privacidade da busca |
| [qa/reports/report-v76-search-personalization-planning-2026-06-19.md](./qa/reports/report-v76-search-personalization-planning-2026-06-19.md) | evidência V76.32 da auditoria e do planejamento de busca/personalização, sem mudança de runtime |
| [qa/reports/report-v76-kcapi-adapter-registry-contract-2026-06-19.md](./qa/reports/report-v76-kcapi-adapter-registry-contract-2026-06-19.md) | evidência V76.31 dos contratos comportamentais de `adapter-registry` |
| [qa/reports/report-v76-kcapi-transport-config-contract-2026-06-19.md](./qa/reports/report-v76-kcapi-transport-config-contract-2026-06-19.md) | evidência V76.30 dos contratos comportamentais de `transport-config` |
| [qa/reports/report-v76-kcapi-bootstrap-driver-core-dossier-2026-06-19.md](./qa/reports/report-v76-kcapi-bootstrap-driver-core-dossier-2026-06-19.md) | evidência V76.29 do No-Go automatizado para extração do bootstrap/driver core |
| [qa/reports/report-v76-css-public-shell-baseline-expansion-2026-06-19.md](./qa/reports/report-v76-css-public-shell-baseline-expansion-2026-06-19.md) | evidência V76.28 da cobertura integral das 12 páginas de `kc-public-shell.css` |
| [qa/reports/report-v76-css-profile-ranking-shell-micro-split-2026-06-19.md](./qa/reports/report-v76-css-profile-ranking-shell-micro-split-2026-06-19.md) | evidência V76.27 do micro-split CSS-C.5 dos badges de ranking do perfil público |
| [qa/reports/report-v76-css-legal-shell-micro-split-2026-06-18.md](./qa/reports/report-v76-css-legal-shell-micro-split-2026-06-18.md) | evidência V76.26 do micro-split CSS-C.4 das cinco páginas legais |
| [qa/reports/report-v76-home-context-density-2026-06-18.md](./qa/reports/report-v76-home-context-density-2026-06-18.md) | evidência V76.25 da compactação do contexto “Sobre o KinoCampus” na home mobile |
| [qa/reports/report-v76-mobile-context-density-2026-06-18.md](./qa/reports/report-v76-mobile-context-density-2026-06-18.md) | evidência V76.24 da compactação visual do título e bottom sheet contextual nos seis módulos |
| [qa/reports/report-v76-context-sidebar-404-responsive-2026-06-18.md](./qa/reports/report-v76-context-sidebar-404-responsive-2026-06-18.md) | evidência V76.23 do contexto responsivo dos seis módulos e reconstrução da página 404 |
| [qa/reports/report-v76-adsense-public-content-resilience-2026-06-17.md](./qa/reports/report-v76-adsense-public-content-resilience-2026-06-17.md) | evidência V76.22 de resiliência pública, metadata SEO e gate Search Console/AdSense |
| [qa/reports/report-v76-cadu-six-image-contract-2026-06-17.md](./qa/reports/report-v76-cadu-six-image-contract-2026-06-17.md) | evidência V76.21 do limite defensivo de seis imagens no publisher e na Edge Function do Cadu |
| [qa/reports/report-v76-css-chat-shortcut-micro-split-2026-06-15.md](./qa/reports/report-v76-css-chat-shortcut-micro-split-2026-06-15.md) | evidência V76 CSS-C.3 do micro-split do atalho global de mensagens para `kc-chat-shortcut.css` |
| [qa/reports/report-v76-notify-admin-reports-threshold-deploy-2026-06-15.md](./qa/reports/report-v76-notify-admin-reports-threshold-deploy-2026-06-15.md) | evidência V76 do deploy controlado da Edge Function `notify-admin-reports-threshold`, mantendo alerta em No-Go/fail-closed |
| [qa/reports/report-v76-kcapi-filters-extraction-2026-06-12.md](./qa/reports/report-v76-kcapi-filters-extraction-2026-06-12.md) | evidencia V76 da extracao de filtros avancados/date presets para `window._KCAPI.filters` |
| [qa/reports/report-v76-kcapi-authors-extraction-2026-06-12.md](./qa/reports/report-v76-kcapi-authors-extraction-2026-06-12.md) | evidencia V76 da extracao de autores mock/indices para `window._KCAPI.authors` |
| [qa/reports/report-v76-kcapi-posts-normalize-extraction-2026-06-12.md](./qa/reports/report-v76-kcapi-posts-normalize-extraction-2026-06-12.md) | evidencia V76 da extracao de `KCAPI.normalizePost` para `window._KCAPI.postsNormalize` |
| [qa/reports/report-v76-kcapi-ratings-normalize-extraction-2026-06-12.md](./qa/reports/report-v76-kcapi-ratings-normalize-extraction-2026-06-12.md) | evidencia V76 da extracao dos normalizadores `normalizeUserRating*` para `window._KCAPI.ratings` |
| [qa/reports/report-v76-kcapi-notification-fallbacks-extraction-2026-06-15.md](./qa/reports/report-v76-kcapi-notification-fallbacks-extraction-2026-06-15.md) | evidência V76 da extração JS-I.2 dos fallbacks canônicos de notificação para `window._KCAPI.notifications` |
| [qa/reports/report-v76-kcapi-post-mutation-bridge-extraction-2026-06-15.md](./qa/reports/report-v76-kcapi-post-mutation-bridge-extraction-2026-06-15.md) | evidência V76 da extração JS-I.3 da ponte de mutação/freshness de posts para `window._KCAPI.postsWrite` |
| [qa/reports/report-v76-css-admin-nav-micro-split-2026-06-15.md](./qa/reports/report-v76-css-admin-nav-micro-split-2026-06-15.md) | evidência V76 CSS-C do micro-split da navegação admin para `admin-shell.css` |
| [qa/reports/report-v76-css-admin-overlap-micro-split-2026-06-15.md](./qa/reports/report-v76-css-admin-overlap-micro-split-2026-06-15.md) | evidência V76 CSS-C.2 do micro-split do overlap admin remanescente para `admin-shell.css` |
| [qa/reports/report-v76-kcapi-external-access-extraction-2026-06-13.md](./qa/reports/report-v76-kcapi-external-access-extraction-2026-06-13.md) | evidência V76 da extração JS-I.1 de external access admin para `window._KCAPI.help` |
| [qa/reports/report-v76-kcapi-residual-inventory-2026-06-12.md](./qa/reports/report-v76-kcapi-residual-inventory-2026-06-12.md) | evidencia V76 do inventario residual JS-I da fachada `KCAPI` |
| [qa/reports/report-v76-css-ownership-inventory-2026-06-12.md](./qa/reports/report-v76-css-ownership-inventory-2026-06-12.md) | evidencia V76 do inventario CSS-A de ownership de `styles.css` |
| [qa/reports/report-v76-css-visual-baseline-2026-06-12.md](./qa/reports/report-v76-css-visual-baseline-2026-06-12.md) | evidencia V76 do baseline CSS-B visual/cascade antes de split de `styles.css` |
| [qa/reports/report-v76-kcapi-session-extraction-2026-06-12.md](./qa/reports/report-v76-kcapi-session-extraction-2026-06-12.md) | evidencia V76 da extracao de `KCSessionStore`/`KCPostFreshness` para `window._KCAPI.session` |
| [qa/reports/report-v76-kcapi-diagnostics-extraction-2026-06-12.md](./qa/reports/report-v76-kcapi-diagnostics-extraction-2026-06-12.md) | evidencia V76 da extracao de diagnostics para `window._KCAPI.diagnostics` |
| [qa/reports/report-v76-kcapi-public-surface-2026-06-12.md](./qa/reports/report-v76-kcapi-public-surface-2026-06-12.md) | snapshot V76 da superficie publica `window.KCAPI` antes de decomposicao JS |
| [qa/reports/report-v75-supabase-auth-password-protection-2026-06-11.md](./qa/reports/report-v75-supabase-auth-password-protection-2026-06-11.md) | evidencia V75 de `password_hibp_enabled=false` no Supabase Auth remoto |
| [qa/reports/report-v75-supabase-unaccent-extension-schema-2026-06-12.md](./qa/reports/report-v75-supabase-unaccent-extension-schema-2026-06-12.md) | evidencia V75 de `unaccent` instalado no schema `extensions` no Supabase remoto |
| [qa/reports/report-v75-generated-output-cleanup-2026-06-11.md](./qa/reports/report-v75-generated-output-cleanup-2026-06-11.md) | evidencia V75 da limpeza de artefatos gerados em `output/` |
| [qa/reports/report-v75-vercel-cache-control-2026-06-11.md](./qa/reports/report-v75-vercel-cache-control-2026-06-11.md) | evidencia V75 de cache efetivo para sitemap e Open Graph na Vercel |
| [qa/reports/report-v75-public-a11y-kc-ranking-icons.md](./qa/reports/report-v75-public-a11y-kc-ranking-icons.md) | evidencia do patch PUBLIC-A11Y nos 18 icones decorativos em kc-ranking.js |
| [qa/reports/report-v74-public-a11y-admin-reports-icons.md](./qa/reports/report-v74-public-a11y-admin-reports-icons.md) | evidencia do patch PUBLIC-A11Y nos 18 icones decorativos em admin-reports.controller.js |
| [qa/reports/report-v73-public-a11y-kc-comments-icons.md](./qa/reports/report-v73-public-a11y-kc-comments-icons.md) | evidencia do patch PUBLIC-A11Y nos 9 icones decorativos em kc-comments.js |
| [qa/reports/report-v72-public-a11y-admin-dashboard-controller-icons.md](./qa/reports/report-v72-public-a11y-admin-dashboard-controller-icons.md) | evidencia do patch PUBLIC-A11Y nos 14 icones decorativos em admin-dashboard.controller.js |
| [qa/reports/report-v71-public-a11y-admin-dashboard-charts-icons.md](./qa/reports/report-v71-public-a11y-admin-dashboard-charts-icons.md) | evidencia do patch PUBLIC-A11Y nos 11 icones decorativos em admin-dashboard.charts.js |
| [qa/reports/report-v70-public-a11y-filters-tab-icon.md](./qa/reports/report-v70-public-a11y-filters-tab-icon.md) | evidencia do patch PUBLIC-A11Y no icone decorativo da aba `Todas` dos filtros publicos |
| [qa/reports/report-v69-public-a11y-pull-to-refresh-icons.md](./qa/reports/report-v69-public-a11y-pull-to-refresh-icons.md) | evidencia do patch PUBLIC-A11Y nos icones decorativos do indicador de pull-to-refresh |
| [qa/reports/report-v68-public-a11y-admin-dashboard-audit-icons.md](./qa/reports/report-v68-public-a11y-admin-dashboard-audit-icons.md) | evidencia do patch PUBLIC-A11Y nos icones de spinner do shard audit do dashboard admin |
| [qa/reports/report-v67-public-a11y-admin-moderation-icons.md](./qa/reports/report-v67-public-a11y-admin-moderation-icons.md) | evidencia do patch PUBLIC-A11Y nos icones decorativos residuais do template admin de moderacao |
| [qa/reports/report-v66-public-a11y-admin-banner-icons.md](./qa/reports/report-v66-public-a11y-admin-banner-icons.md) | evidencia do patch PUBLIC-A11Y nos icones decorativos do template admin de banners |
| [qa/reports/report-v65-public-a11y-admin-help-request-icons.md](./qa/reports/report-v65-public-a11y-admin-help-request-icons.md) | evidencia do patch PUBLIC-A11Y nos icones de chips e feedback em pedidos de ajuda admin |
| [qa/reports/report-v64-public-a11y-admin-invite-feedback-icons.md](./qa/reports/report-v64-public-a11y-admin-invite-feedback-icons.md) | evidencia do patch PUBLIC-A11Y nos icones de feedback/loading em convites admin |
| [qa/reports/report-v63-public-a11y-admin-help-load-more-icons.md](./qa/reports/report-v63-public-a11y-admin-help-load-more-icons.md) | evidencia do patch PUBLIC-A11Y nos icones do carregar mais de pedidos admin |
| [qa/reports/report-v62-public-a11y-admin-decorative-icons.md](./qa/reports/report-v62-public-a11y-admin-decorative-icons.md) | evidencia do patch PUBLIC-A11Y em icones decorativos admin |
| [qa/reports/report-v61-public-a11y-dynamic-button-types.md](./qa/reports/report-v61-public-a11y-dynamic-button-types.md) | evidencia do patch PUBLIC-A11Y em botoes dinamicos publicos/admin |
| [qa/reports/report-v60-public-a11y-comment-action-buttons.md](./qa/reports/report-v60-public-a11y-comment-action-buttons.md) | evidencia do patch PUBLIC-A11Y nos botoes dinamicos de comentarios |
| [qa/reports/report-v59-public-a11y-mobile-search-modal-input.md](./qa/reports/report-v59-public-a11y-mobile-search-modal-input.md) | evidencia do patch PUBLIC-A11Y no input e icone de busca do modal mobile |
| [qa/reports/report-v58-public-a11y-mobile-search-modal-controls.md](./qa/reports/report-v58-public-a11y-mobile-search-modal-controls.md) | evidencia do patch PUBLIC-A11Y nos controles do modal de busca mobile |
| [qa/reports/report-v57-public-a11y-post-card-author-avatar-alt.md](./qa/reports/report-v57-public-a11y-post-card-author-avatar-alt.md) | evidencia do patch PUBLIC-A11Y no alt do avatar de autor de `renderPostCard` |
| [qa/reports/report-v56-public-a11y-post-card-decorative-icons.md](./qa/reports/report-v56-public-a11y-post-card-decorative-icons.md) | evidencia do patch PUBLIC-A11Y nos icones decorativos de `renderPostCard` |
| [qa/reports/report-v55-public-a11y-post-card-rating.md](./qa/reports/report-v55-public-a11y-post-card-rating.md) | evidencia do patch PUBLIC-A11Y no badge de avaliacao de `renderPostCard` |
| [qa/reports/report-v54-public-a11y-post-card-comments.md](./qa/reports/report-v54-public-a11y-post-card-comments.md) | evidencia do patch PUBLIC-A11Y em `renderPostCard` |
| [qa/v31-authenticated-flow-triage-matrix.md](./qa/v31-authenticated-flow-triage-matrix.md) | matriz P0/P1 para triagem autenticada real |
| [qa/v32-e2e-gate-policy.md](./qa/v32-e2e-gate-policy.md) | politica de evidencia Playwright E2E por tipo de mudanca |
| [qa/v33-lhci-baseline-policy.md](./qa/v33-lhci-baseline-policy.md) | politica de evidencia Lighthouse/LHCI e classificacao de ambiente |
| [qa/v34-a11y-i18n-reconciliation-plan.md](./qa/v34-a11y-i18n-reconciliation-plan.md) | plano de reconciliacao a11y/i18n antes de backlog funcional |

## Fonte de verdade por dominio

1. Codigo e comportamento real prevalecem sobre documentacao antiga.
2. Banco de dados: Supabase Dashboard, migrations e RPCs.
3. Contratos de frontend: `assets/js/api/kc-api.client.js`, adapters, controllers e HTMLs.
4. Estado da v75: `RELATORIO-KINOCAMPUS-V75.md`.
5. Guia de IA: `docs/architecture/ai-development-guide.md`.

## Quick reference

```javascript
// Feed incremental
KCAPI.getFeedCursor({ module: 'eventos', sortBy: 'recentes', limit: 20, cursor: null });

// Busca dedicada
KCAPI.searchPosts({ q: 'moradia setor oeste', module: 'moradia', limit: 12 });

// Ranking
KCAPI.getTopContributors('month', 'moradia', 10);

// Admin - pedidos de ajuda
KCAPI.listAdminHelpRequests({ status: 'new', type: 'question', limit: 25, offset: 0 });

// Sanitizacao obrigatoria antes de innerHTML
el.innerHTML = window.KCUtils.escapeHtml(userContent);
```

## Observacoes de baseline

- Baseline reancorado para v75.0.0 em 2026-05-05. Estrutura documental consolidada em `docs/archive/` em v17.5.0; pendências ativas mapeadas em `docs/planning/` em v18, operacionalizadas em runbooks v19, separadas entre QA ativo/histórico em v20, com worktrees locais fora do índice em v21, política de relatórios raiz em v22, `repository-structure.md` reancorado em v23, ledger pós-V23 criado em v24, runbook de QA real criado em v25, templates de evidência QA real normalizados em v26, gate visual/a11y pré-CSS definido em v27, auditoria unaccent/FTS pre-migration criada em v28, checklist de evidências Supabase Advisor criado em v29, checklist de sandbox para providers de notificação criado em v30, matriz de triagem autenticada criada em v31, política de gate E2E criada em v32, política LHCI criada em v33, plano de reconciliação a11y/i18n criado em v34, ledger de readiness CSS criado em v35, roadmap de readiness criado em v36, gate de entrada funcional criado em v37, gate de evidência de rollback criado em v38, matriz de candidatos funcionais criada em v39, dossiê AUTH-CB-01 criado em v40, dossiê PROFILE-AV-01 criado em v41, dossiê ADMIN-MOD-01 criado em v42, dossiê NOTIF-SB-01 criado em v43, dossiê SEARCH-FTS-01 criado em v44, dossiê CSS-SM-01 criado em v45, dossiê PUBLIC-A11Y-01 criado em v46, consolidação de readiness funcional criada em v47, pacote de evidências externas sem secrets criado em v48, freeze de escopo funcional criado em v49, intake de implementação funcional criado em v50, registro de No-Go funcional criado em v51, matriz de rastreabilidade de gates criada em v52, manifesto de patch funcional criado em v53, patches PUBLIC-A11Y v54-v75 executados, inventário residual JS-I da fachada `KCAPI` criado em v76.10, extração JS-I.1 de external access admin criada em v76.11, extração JS-I.2 dos fallbacks canônicos de notificação criada em v76.12, extração JS-I.3 da ponte de mutação/freshness de posts criada em v76.13, micro-split CSS-C da navegação admin criado em v76.14, micro-split CSS-C.2 do overlap admin criado em v76.15 e micro-split CSS-C.3 do atalho global de mensagens criado em v76.17.
- Estado operacional atual: `appVersion=75.1.0`, `frontendRuntimeVersion=8.6.1`, 188 suites Jest / 3761 testes e 10 specs Playwright / 68 testes listados.
- `frontendRuntimeVersion` atual e `8.6.1` (constante canonica no runtime).
