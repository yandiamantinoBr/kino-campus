# KinoCampus — Documentação Técnica v9

## Documentos Disponíveis

| Arquivo | O que você vai encontrar |
|---------|--------------------------|
| [architecture.md](./architecture.md) | Padrão IIFE, padrão driver, mapa de dependências, fluxos de dados, páginas HTML, arquitetura CSS |
| [api-contract.md](./api-contract.md) | Todos os métodos KCAPI — params, retorno, erros esperados |
| [db-schema.md](./db-schema.md) | Todas as tabelas, colunas, RLS, indexes, Storage buckets, pg_cron jobs |
| [rpc-catalog.md](./rpc-catalog.md) | Todos os RPCs e triggers do PostgreSQL com assinaturas e lógica |
| [module-schemas.md](./module-schemas.md) | KC_CREATE_SCHEMA — schemas de criação para cada um dos 6 módulos |
| [env-vars.md](./env-vars.md) | Variáveis de ambiente Vercel e Supabase, KC_ENV, desenvolvimento local |
| [design-system.md](./design-system.md) | CSS custom properties, componentes, breakpoints, ícones, tipografia |

## Roteiro de Desenvolvimento

O roteiro completo de features v9 está no arquivo de plano em:
`C:\Users\yan1n\.claude\plans\validated-frolicking-nebula.md`

## Versão Atual

**v9.0.0** (fundações — segurança, documentação, testes)

## Quick Reference

```javascript
// Buscar posts
KCAPI.getPosts({ module: 'eventos', sort: 'recent', limit: 20 })

// Criar post (requer auth)
KCAPI.createPost({ module: 'compra-venda', title: '...', category: 'Eletrônicos', ... })

// Top contribuidores
KCAPI.getTopContributors('month', null, 10)

// Sanitizar HTML antes de inserir no DOM (OBRIGATÓRIO)
el.innerHTML = window.KCUtils.escapeHtml(userContent)
```
