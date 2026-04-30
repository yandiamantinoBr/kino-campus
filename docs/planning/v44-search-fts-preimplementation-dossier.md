# V44 - Dossie Pre-Implementacao SEARCH-FTS-01

**Versao:** v44.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, migrations, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P1 `SEARCH-FTS-01` antes de qualquer migration ou patch funcional. O alvo e
validar `unaccent`/FTS em banco isolado com todas as migrations aplicadas, comparando busca antes/depois,
preservando `public.kc_unaccent` como contrato interno e exigindo rollback R3 antes de qualquer SQL.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `SEARCH-FTS-01` |
| Trilha | Unaccent/FTS isolado |
| Prioridade | P1 |
| Risco principal | Mover ou qualificar `unaccent` quebra ranking, filtros textuais, RPC de busca ou indice GIN |
| Estado atual | Bloqueado ate banco isolado, dataset controlado, comparativo antes/depois e rollback R3 |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Banco isolado com 83 migrations aplicadas | Auditoria V28 | Sim |
| Estado atual de `pg_extension`, `pg_namespace` e `pg_proc` redigido | Template V44 | Sim |
| Dependencias de `unaccent`, `kc_unaccent`, `kc_posts_search_document` e `idx_posts_fts` medidas | V28 | Sim |
| Queries com acento/sem acento comparadas antes/depois | Template V44 | Sim |
| `kc_search_posts_fts` e feed textual testados | Template V44 | Sim |
| Plano de rollback R3 escrito antes de migration | Gate V38 | Sim |
| Gate V37 preenchido | `docs/qa/reports/_TEMPLATE-functional-entry-gate.md` | Sim |
| Candidato V39 confirmado | `docs/qa/reports/_TEMPLATE-functional-candidate.md` | Sim |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| Nova migration idempotente em `supabase/migrations/` | Alterar producao sem banco isolado |
| `docs/ops/v28-unaccent-fts-dependency-audit.md` se o spike revelar drift | Remover `public.kc_unaccent` |
| testes SQL/contrato direcionados em `tests/` se houver harness existente | Trocar UX de busca ou CSS |
| `assets/js/shared/kc-search.shared.js` somente se contrato frontend exigir | Refactor de feed ou ranking amplo |
| `assets/js/features/kc-search.js` somente se evidencia apontar bug de chamada | Mudar provider, auth, admin ou profile em paralelo |
| docs QA/ops relacionados | Dados reais, dumps ou connection strings no repo |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Banco isolado com migrations completas | Obrigatorio antes de Go |
| SQL smoke antes/depois | Obrigatorio |
| Comparativo de busca acento/sem acento | Obrigatorio |
| Validacao de indice/RPC | Obrigatorio |
| Rollback V38 classe R3 | Obrigatorio |
| Evidencia redigida | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem banco isolado | Bloqueado |
| Sem comparativo antes/depois | Bloqueado |
| Necessidade de remover `public.kc_unaccent` | No-Go |
| Migration exige rebuild de indice sem janela/rollback | No-Go |
| Wrapper preservado, resultados equivalentes e rollback R3 testado | Go condicionado a branch funcional/SQL |
| Falha apenas documental/contratual sem SQL | Go documental, sem migration |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-search-fts-evidence.md` antes de abrir qualquer branch
funcional ou SQL para `SEARCH-FTS-01`.
