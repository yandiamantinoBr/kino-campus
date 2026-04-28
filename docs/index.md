# KinoCampus - Documentacao Tecnica

## Baseline atual

- release documental consolidada: `v24.0.0`
- linha de trabalho atual: `v24`
- branch-base operacional: `kinocampus-V24.0-foundations`
- documento de execucao da v24: [../RELATORIO-KINOCAMPUS-V24.md](../RELATORIO-KINOCAMPUS-V24.md)

## Documentos canonicos

| Arquivo | Uso principal |
|---|---|
| [architecture.md](./architecture.md) | arquitetura atual do frontend, camadas, hotspots, contagens e regras de equivalencia |
| [architecture/repository-structure.md](./architecture/repository-structure.md) | estrutura atual do repositorio pos-V22 com janela raiz V20-V24 |
| [architecture/module-catalog.md](./architecture/module-catalog.md) | catalogo de ~130 modulos JS com namespace, paginas e dependencias *(v16.3.0-v16.4.0)* |
| [architecture/controllers-catalog.md](./architecture/controllers-catalog.md) | catalogo de 41 controllers com responsabilidade e KCAPI calls *(v16.5.0)* |
| [architecture/script-loading-reference.md](./architecture/script-loading-reference.md) | ordem de carregamento de scripts em 22 HTMLs *(v16.6.0)* |
| [architecture/data-flow-guide.md](./architecture/data-flow-guide.md) | fluxo de dados ponta a ponta: usuario -> controller -> KCAPI -> adapter -> Supabase *(v16.7.0)* |
| [architecture/ai-development-guide.md](./architecture/ai-development-guide.md) | guia de comportamento para IA: leia antes de qualquer modificacao *(v16.8.0, reancorado em V24)* |
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
| [../RELATORIO-KINOCAMPUS-V24.md](../RELATORIO-KINOCAMPUS-V24.md) | ledger pos-V23 de pendencias e status da v24 (atual) |
| [../RELATORIO-KINOCAMPUS-V23.md](../RELATORIO-KINOCAMPUS-V23.md) | reancoragem da estrutura do repositorio da v23 |
| [../RELATORIO-KINOCAMPUS-V22.md](../RELATORIO-KINOCAMPUS-V22.md) | politica de relatorios raiz da v22 |
| [../RELATORIO-KINOCAMPUS-V21.md](../RELATORIO-KINOCAMPUS-V21.md) | arquivamento de worktree Claude rastreada da v21 (encerrada) |
| [../RELATORIO-KINOCAMPUS-V20.md](../RELATORIO-KINOCAMPUS-V20.md) | separacao de QA ativo e historico da v20 (encerrada) |
| [archive/relatorios/_INDEX.md](./archive/relatorios/_INDEX.md) | relatorios historicos arquivados V9, V11, V13-V19 |
| [planning/_INDEX.md](./planning/_INDEX.md) | indice dos planos ativos e inventarios pendentes |
| [archive/_INDEX.md](./archive/_INDEX.md) | indice geral do arquivo historico com ~85 docs |
| [ops/vercel-supabase-invariants.md](./ops/vercel-supabase-invariants.md) | invariantes operacionais entre Vercel, Supabase, build e deploy |
| [qa/README.md](./qa/README.md) | mapa dos artefatos de QA e referencia rapida de validacao |

## Fonte de verdade por dominio

1. Codigo e comportamento real prevalecem sobre documentacao antiga.
2. Banco de dados: Supabase Dashboard, migrations e RPCs.
3. Contratos de frontend: `assets/js/api/kc-api.client.js`, adapters, controllers e HTMLs.
4. Estado da v24: `RELATORIO-KINOCAMPUS-V24.md`.
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

- Baseline reancorado para v24.0.0 em 2026-04-28. Estrutura documental consolidada em `docs/archive/` em v17.5.0; pendencias ativas mapeadas em `docs/planning/` em v18, operacionalizadas em runbooks v19, separadas entre QA ativo/historico em v20, com worktrees locais fora do indice em v21, politica de relatorios raiz em v22, `repository-structure.md` reancorado em v23 e ledger pos-V23 criado em v24.
- `frontendRuntimeVersion` permanece em `8.6.0` (constante canonica no runtime).
