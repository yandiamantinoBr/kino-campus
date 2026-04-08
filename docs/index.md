# KinoCampus - Documentação Técnica

## Baseline atual

- release funcional consolidada: `v10.0.0`
- linha de trabalho atual: `v11`
- branch-base operacional: `kinocampus-V10.0-foundations`
- documento de execução da v11: [../RELATORIO-KINOCAMPUS-V11.md](../RELATORIO-KINOCAMPUS-V11.md)

## Documentos canônicos

| Arquivo | Uso principal |
|---------|---------------|
| [architecture.md](./architecture.md) | arquitetura atual do frontend, camadas, hotspots, contagens e regras de equivalência |
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
| [../RELATORIO-KINOCAMPUS-V9.md](../RELATORIO-KINOCAMPUS-V9.md) | relatório da linha v9 e contexto histórico da estabilização anterior |
| [../RELATORIO-KINOCAMPUS-V11.md](../RELATORIO-KINOCAMPUS-V11.md) | plano diretor e registro vivo das iterações da v11 |
| [ops/vercel-supabase-invariants.md](./ops/vercel-supabase-invariants.md) | invariantes operacionais entre Vercel, Supabase, build e deploy |
| [qa/README.md](./qa/README.md) | mapa dos artefatos de QA e referência rápida de validação |

## Fonte de verdade por domínio

1. Código e comportamento real prevalecem sobre documentação antiga.
2. Banco de dados: `supabase/schema-*.sql` e `supabase/migrations/*.sql`.
3. Contratos de frontend: `assets/js/kc-api.client.js`, adapters, controllers compartilhados e HTMLs equivalentes.
4. Estado da v11: `RELATORIO-KINOCAMPUS-V11.md`.

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

- A documentação foi reancorada na linha `v10` em `2026-04-08` durante a iteração `v11.1.0`.
- Algumas constantes canônicas embutidas no frontend ainda permanecem em `8.6.0`; esse drift está documentado e passa a ser acompanhado formalmente na v11.
