# KinoCampus - Documentacao Tecnica

## Baseline atual

- release consolidada: `v72.0.0`
- linha de trabalho atual: `v72`
- branch-base operacional: `kinocampus-V72.0-foundations`
- documento de execucao da v72: [../RELATORIO-KINOCAMPUS-V72.md](../RELATORIO-KINOCAMPUS-V72.md)

## Documentos canonicos

| Arquivo | Uso principal |
|---|---|
| [architecture.md](./architecture.md) | arquitetura atual do frontend, camadas, hotspots, contagens e regras de equivalencia |
| [architecture/repository-structure.md](./architecture/repository-structure.md) | estrutura atual do repositorio pos-V22 com janela raiz V68-V72 |
| [architecture/module-catalog.md](./architecture/module-catalog.md) | catalogo de ~130 modulos JS com namespace, paginas e dependencias *(v16.3.0-v16.4.0)* |
| [architecture/controllers-catalog.md](./architecture/controllers-catalog.md) | catalogo de 41 controllers com responsabilidade e KCAPI calls *(v16.5.0)* |
| [architecture/script-loading-reference.md](./architecture/script-loading-reference.md) | ordem de carregamento de scripts em 22 HTMLs *(v16.6.0)* |
| [architecture/data-flow-guide.md](./architecture/data-flow-guide.md) | fluxo de dados ponta a ponta: usuario -> controller -> KCAPI -> adapter -> Supabase *(v16.7.0)* |
| [architecture/ai-development-guide.md](./architecture/ai-development-guide.md) | guia de comportamento para IA: leia antes de qualquer modificacao *(v16.8.0, reancorado em V72)* |
| [architecture/test-strategy.md](./architecture/test-strategy.md) | estrategia de 135 suites: onde adicionar testes, regras de manutencao *(v16.9.0)* |
| [architecture/css-architecture.md](./architecture/css-architecture.md) | CSS em producao + `future-split/` explicado *(v16.10.0)* |
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
| [../RELATORIO-KINOCAMPUS-V72.md](../RELATORIO-KINOCAMPUS-V72.md) | patch PUBLIC-A11Y admin dashboard controller decorative icons da v72 (atual) |
| [../RELATORIO-KINOCAMPUS-V71.md](../RELATORIO-KINOCAMPUS-V71.md) | patch PUBLIC-A11Y admin dashboard charts decorative icons da v71 |
| [../RELATORIO-KINOCAMPUS-V70.md](../RELATORIO-KINOCAMPUS-V70.md) | patch PUBLIC-A11Y filters tab decorative icon da v70 |
| [../RELATORIO-KINOCAMPUS-V69.md](../RELATORIO-KINOCAMPUS-V69.md) | patch PUBLIC-A11Y pull-to-refresh decorative icons da v69 |
| [../RELATORIO-KINOCAMPUS-V68.md](../RELATORIO-KINOCAMPUS-V68.md) | patch PUBLIC-A11Y admin dashboard audit decorative icons da v68 |
| [archive/relatorios/_INDEX.md](./archive/relatorios/_INDEX.md) | relatorios historicos arquivados V9, V11, V13-V67 |
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
| [ops/vercel-supabase-invariants.md](./ops/vercel-supabase-invariants.md) | invariantes operacionais entre Vercel, Supabase, build e deploy |
| [ops/v28-unaccent-fts-dependency-audit.md](./ops/v28-unaccent-fts-dependency-audit.md) | auditoria estatica de dependencias `unaccent`/FTS antes de migration |
| [ops/v29-supabase-advisor-evidence-checklist.md](./ops/v29-supabase-advisor-evidence-checklist.md) | checklist de evidencias Supabase Advisor sem secrets |
| [ops/v30-notification-provider-sandbox-checklist.md](./ops/v30-notification-provider-sandbox-checklist.md) | checklist de sandbox/go-live para providers de email e WhatsApp |
| [ops/v48-external-evidence-request-pack.md](./ops/v48-external-evidence-request-pack.md) | pacote de solicitacao/redacao de evidencias externas sem secrets |
| [qa/README.md](./qa/README.md) | mapa dos artefatos de QA e referencia rapida de validacao |
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
4. Estado da v72: `RELATORIO-KINOCAMPUS-V72.md`.
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

- Baseline reancorado para v71.0.0 em 2026-05-05. Estrutura documental consolidada em `docs/archive/` em v17.5.0; pendencias ativas mapeadas em `docs/planning/` em v18, operacionalizadas em runbooks v19, separadas entre QA ativo/historico em v20, com worktrees locais fora do indice em v21, politica de relatorios raiz em v22, `repository-structure.md` reancorado em v23, ledger pos-V23 criado em v24, runbook de QA real criado em v25, templates de evidencia QA real normalizados em v26, gate visual/a11y pre-CSS definido em v27, auditoria unaccent/FTS pre-migration criada em v28, checklist de evidencias Supabase Advisor criado em v29, checklist de sandbox para providers de notificacao criado em v30, matriz de triagem autenticada criada em v31, politica de gate E2E criada em v32, politica LHCI criada em v33, plano de reconciliacao a11y/i18n criado em v34, ledger de readiness CSS criado em v35, roadmap de readiness criado em v36, gate de entrada funcional criado em v37, gate de evidencia de rollback criado em v38, matriz de candidatos funcionais criada em v39, dossie AUTH-CB-01 criado em v40, dossie PROFILE-AV-01 criado em v41, dossie ADMIN-MOD-01 criado em v42, dossie NOTIF-SB-01 criado em v43, dossie SEARCH-FTS-01 criado em v44, dossie CSS-SM-01 criado em v45, dossie PUBLIC-A11Y-01 criado em v46, consolidacao de readiness funcional criada em v47, pacote de evidencias externas sem secrets criado em v48, freeze de escopo funcional criado em v49, intake de implementacao funcional criado em v50, registro de No-Go funcional criado em v51, matriz de rastreabilidade de gates criada em v52, manifesto de patch funcional criado em v53, patch PUBLIC-A11Y de comentarios do card criado em v54, patch PUBLIC-A11Y do badge de avaliacao criado em v55, patch PUBLIC-A11Y de icones decorativos criado em v56, patch PUBLIC-A11Y do alt do avatar de autor criado em v57, patch PUBLIC-A11Y dos controles do modal de busca mobile criado em v58, patch PUBLIC-A11Y do input do modal de busca mobile criado em v59, patch PUBLIC-A11Y dos botoes dinamicos de comentarios criado em v60, patch PUBLIC-A11Y de `type="button"` em botoes dinamicos publicos/admin criado em v61, patch PUBLIC-A11Y de icones decorativos admin criado em v62, patch PUBLIC-A11Y de icones do carregar mais em pedidos admin criado em v63, patch PUBLIC-A11Y de icones de feedback/loading em convites admin criado em v64, patch PUBLIC-A11Y de icones decorativos em pedidos de ajuda admin criado em v65, patch PUBLIC-A11Y de icones decorativos em banners admin criado em v66, patch PUBLIC-A11Y dos icones residuais em moderacao admin criado em v67, patch PUBLIC-A11Y dos icones de spinner do shard audit do dashboard admin criado em v68, patch PUBLIC-A11Y dos icones decorativos do indicador de pull-to-refresh criado em v69, patch PUBLIC-A11Y do icone decorativo da aba `Todas` dos filtros publicos criado em v70 patch PUBLIC-A11Y dos 11 icones decorativos do ranking e modulos em admin-dashboard.charts.js criado em v71 e patch PUBLIC-A11Y dos 14 icones decorativos de titulos de secao e feedback em admin-dashboard.controller.js criado em v72.
- `frontendRuntimeVersion` permanece em `8.6.0` (constante canonica no runtime).
