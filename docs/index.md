# KinoCampus - Documentacao Tecnica

## Baseline atual

- release documental consolidada: `v37.0.0`
- linha de trabalho atual: `v37`
- branch-base operacional: `kinocampus-V37.0-foundations`
- documento de execucao da v37: [../RELATORIO-KINOCAMPUS-V37.md](../RELATORIO-KINOCAMPUS-V37.md)

## Documentos canonicos

| Arquivo | Uso principal |
|---|---|
| [architecture.md](./architecture.md) | arquitetura atual do frontend, camadas, hotspots, contagens e regras de equivalencia |
| [architecture/repository-structure.md](./architecture/repository-structure.md) | estrutura atual do repositorio pos-V22 com janela raiz V33-V37 |
| [architecture/module-catalog.md](./architecture/module-catalog.md) | catalogo de ~130 modulos JS com namespace, paginas e dependencias *(v16.3.0-v16.4.0)* |
| [architecture/controllers-catalog.md](./architecture/controllers-catalog.md) | catalogo de 41 controllers com responsabilidade e KCAPI calls *(v16.5.0)* |
| [architecture/script-loading-reference.md](./architecture/script-loading-reference.md) | ordem de carregamento de scripts em 22 HTMLs *(v16.6.0)* |
| [architecture/data-flow-guide.md](./architecture/data-flow-guide.md) | fluxo de dados ponta a ponta: usuario -> controller -> KCAPI -> adapter -> Supabase *(v16.7.0)* |
| [architecture/ai-development-guide.md](./architecture/ai-development-guide.md) | guia de comportamento para IA: leia antes de qualquer modificacao *(v16.8.0, reancorado em V37)* |
| [architecture/test-strategy.md](./architecture/test-strategy.md) | estrategia de 134 suites: onde adicionar testes, regras de manutencao *(v16.9.0)* |
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
| [../RELATORIO-KINOCAMPUS-V37.md](../RELATORIO-KINOCAMPUS-V37.md) | gate de entrada funcional da v37 (atual) |
| [../RELATORIO-KINOCAMPUS-V36.md](../RELATORIO-KINOCAMPUS-V36.md) | roadmap de readiness para implementacao futura da v36 |
| [../RELATORIO-KINOCAMPUS-V35.md](../RELATORIO-KINOCAMPUS-V35.md) | ledger de readiness CSS da v35 |
| [../RELATORIO-KINOCAMPUS-V34.md](../RELATORIO-KINOCAMPUS-V34.md) | plano de reconciliacao a11y/i18n da v34 |
| [../RELATORIO-KINOCAMPUS-V33.md](../RELATORIO-KINOCAMPUS-V33.md) | politica de baseline Lighthouse/LHCI da v33 |
| [archive/relatorios/_INDEX.md](./archive/relatorios/_INDEX.md) | relatorios historicos arquivados V9, V11, V13-V32 |
| [planning/_INDEX.md](./planning/_INDEX.md) | indice dos planos ativos e inventarios pendentes |
| [archive/_INDEX.md](./archive/_INDEX.md) | indice geral do arquivo historico com ~85 docs |
| [planning/v35-css-readiness-ledger.md](./planning/v35-css-readiness-ledger.md) | pre-requisitos para split CSS, ajustes visuais e rollback |
| [planning/v36-implementation-readiness-roadmap.md](./planning/v36-implementation-readiness-roadmap.md) | ordem segura para transformar readiness em implementacao futura |
| [planning/v37-functional-entry-gate.md](./planning/v37-functional-entry-gate.md) | gate de entrada para qualquer versao funcional futura |
| [ops/vercel-supabase-invariants.md](./ops/vercel-supabase-invariants.md) | invariantes operacionais entre Vercel, Supabase, build e deploy |
| [ops/v28-unaccent-fts-dependency-audit.md](./ops/v28-unaccent-fts-dependency-audit.md) | auditoria estatica de dependencias `unaccent`/FTS antes de migration |
| [ops/v29-supabase-advisor-evidence-checklist.md](./ops/v29-supabase-advisor-evidence-checklist.md) | checklist de evidencias Supabase Advisor sem secrets |
| [ops/v30-notification-provider-sandbox-checklist.md](./ops/v30-notification-provider-sandbox-checklist.md) | checklist de sandbox/go-live para providers de email e WhatsApp |
| [qa/README.md](./qa/README.md) | mapa dos artefatos de QA e referencia rapida de validacao |
| [qa/v31-authenticated-flow-triage-matrix.md](./qa/v31-authenticated-flow-triage-matrix.md) | matriz P0/P1 para triagem autenticada real |
| [qa/v32-e2e-gate-policy.md](./qa/v32-e2e-gate-policy.md) | politica de evidencia Playwright E2E por tipo de mudanca |
| [qa/v33-lhci-baseline-policy.md](./qa/v33-lhci-baseline-policy.md) | politica de evidencia Lighthouse/LHCI e classificacao de ambiente |
| [qa/v34-a11y-i18n-reconciliation-plan.md](./qa/v34-a11y-i18n-reconciliation-plan.md) | plano de reconciliacao a11y/i18n antes de backlog funcional |

## Fonte de verdade por dominio

1. Codigo e comportamento real prevalecem sobre documentacao antiga.
2. Banco de dados: Supabase Dashboard, migrations e RPCs.
3. Contratos de frontend: `assets/js/api/kc-api.client.js`, adapters, controllers e HTMLs.
4. Estado da v37: `RELATORIO-KINOCAMPUS-V37.md`.
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

- Baseline reancorado para v37.0.0 em 2026-04-29. Estrutura documental consolidada em `docs/archive/` em v17.5.0; pendencias ativas mapeadas em `docs/planning/` em v18, operacionalizadas em runbooks v19, separadas entre QA ativo/historico em v20, com worktrees locais fora do indice em v21, politica de relatorios raiz em v22, `repository-structure.md` reancorado em v23, ledger pos-V23 criado em v24, runbook de QA real criado em v25, templates de evidencia QA real normalizados em v26, gate visual/a11y pre-CSS definido em v27, auditoria unaccent/FTS pre-migration criada em v28, checklist de evidencias Supabase Advisor criado em v29, checklist de sandbox para providers de notificacao criado em v30, matriz de triagem autenticada criada em v31, politica de gate E2E criada em v32, politica LHCI criada em v33, plano de reconciliacao a11y/i18n criado em v34, ledger de readiness CSS criado em v35, roadmap de readiness criado em v36 e gate de entrada funcional criado em v37.
- `frontendRuntimeVersion` permanece em `8.6.0` (constante canonica no runtime).
