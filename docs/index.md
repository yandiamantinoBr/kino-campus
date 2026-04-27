# KinoCampus - Documentação Técnica

## Baseline atual

- release funcional consolidada: `v16.0.0`
- linha de trabalho atual: `v16`
- branch-base operacional: `kinocampus-V15.0-foundations`
- documento de execução da v16: [../RELATORIO-KINOCAMPUS-V16.md](../RELATORIO-KINOCAMPUS-V16.md)

## Documentos canônicos

| Arquivo | Uso principal |
|---------|---------------|
| [architecture.md](./architecture.md) | arquitetura atual do frontend, camadas, hotspots, contagens e regras de equivalência |
| [architecture/repository-structure.md](./architecture/repository-structure.md) | estrutura completa do repositório: 13 grupos JS, namespaces, CSS, testes, delta V14×V15×V16 |
| [architecture/module-catalog.md](./architecture/module-catalog.md) | catálogo de ~130 módulos JS com namespace, páginas e dependências *(v16.3.0–v16.4.0)* |
| [architecture/controllers-catalog.md](./architecture/controllers-catalog.md) | catálogo de 41 controllers com responsabilidade e KCAPI calls *(v16.5.0)* |
| [architecture/script-loading-reference.md](./architecture/script-loading-reference.md) | ordem de carregamento de scripts em 22 HTMLs *(v16.6.0)* |
| [architecture/data-flow-guide.md](./architecture/data-flow-guide.md) | fluxo de dados ponta a ponta: usuário → controller → KCAPI → adapter → Supabase *(v16.7.0)* |
| [architecture/ai-development-guide.md](./architecture/ai-development-guide.md) | **guia de comportamento para IA** — leia antes de qualquer modificação *(v16.8.0)* |
| [architecture/test-strategy.md](./architecture/test-strategy.md) | estratégia de 134 suites: onde adicionar testes, regras de manutenção *(v16.9.0)* |
| [architecture/css-architecture.md](./architecture/css-architecture.md) | CSS em produção + future-split/ explicado *(v16.10.0)* |
| [api-contract.md](./api-contract.md) | contrato público da `KCAPI`, métodos expostos e semântica de retorno |
| [db-schema.md](./db-schema.md) | tabelas, políticas, índices, storage, cron jobs e notas de estado do banco |
| [rpc-catalog.md](./rpc-catalog.md) | catálogo de RPCs, triggers e funções do PostgreSQL usadas pelo app |
| [module-schemas.md](./module-schemas.md) | schemas de criação e metadados dos 6 módulos públicos |
| [env-vars.md](./env-vars.md) | build-time, runtime, `KC_ENV`, Supabase e observações de drift de versão |
| [design-system.md](./design-system.md) | tokens visuais, componentes CSS, popovers e convenções responsivas |

## Documentos operacionais complementares

| Arquivo | Uso principal |
|---------|---------------|
| [../README.md](../README.md) | visão executiva do projeto, stack, setup, fluxo operacional e estado da release |
| [../CHANGELOG.md](../CHANGELOG.md) | histórico consolidado de releases e hotfixes |
| [../RELATORIO-KINOCAMPUS-V16.md](../RELATORIO-KINOCAMPUS-V16.md) | plano diretor e registro vivo das iterações da v16 |
| [ops/vercel-supabase-invariants.md](./ops/vercel-supabase-invariants.md) | invariantes operacionais entre Vercel, Supabase, build e deploy |
| [qa/README.md](./qa/README.md) | mapa dos artefatos de QA e referência rápida de validação |

## Fonte de verdade por domínio

1. Código e comportamento real prevalecem sobre documentação antiga.
2. Banco de dados: Supabase Dashboard (tabelas, migrations, RPCs).
3. Contratos de frontend: `assets/js/api/kc-api.client.js`, adapters, controllers e HTMLs.
4. Estado da v16: `RELATORIO-KINOCAMPUS-V16.md`.
5. Guia de IA: `docs/architecture/ai-development-guide.md` *(disponível em v16.8.0)*.

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

// Sanitização obrigatória antes de innerHTML
el.innerHTML = window.KCUtils.escapeHtml(userContent);
```

## Observações de baseline

- Baseline reancorado para v16.0.0 em 2026-04-26 durante a iteração v16.2.0.
- frontendRuntimeVersion permanece em `8.6.0` (constante canônica no runtime).
