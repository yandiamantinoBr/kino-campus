# Relatorio KinoCampus V44 - Dossie Pre-Implementacao SEARCH-FTS-01

**Versao:** v44.0.0
**Status:** Encerrada
**Periodo:** 2026-04-29 -> 2026-04-29
**Branch:** `kinocampus-V44.0-foundations`
**Tipo:** documental/planning-only

---

## 1. Objetivo

Detalhar o candidato P1 `SEARCH-FTS-01` antes de qualquer migration ou patch funcional, definindo
evidencia de banco isolado para `unaccent`/FTS, comparativo antes/depois, rollback R3, filescope
inicial e decisoes Go/No-Go.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Dossie planning | `docs/planning/v44-search-fts-preimplementation-dossier.md` criado |
| Template QA | `docs/qa/reports/_TEMPLATE-search-fts-evidence.md` criado |
| Planning/QA indexes | `docs/planning/_INDEX.md` e `docs/qa/README.md` atualizados |
| Matriz V39 | Referencia ao dossie SEARCH-FTS-01 V44 adicionada |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V39.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, docs index, guia de IA, workflow Lighthouse e validators reancorados para V44 |

---

## 3. Nao Escopo

- Nenhuma alteracao funcional em JS.
- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs.
- Nenhuma migration Supabase alterada.
- Nenhum SQL executado.
- Nenhum secret/provider configurado.
- Nenhuma alteracao em CI.

---

## 4. Metricas

| Metrica | Antes (V43) | Depois (V44) | Delta |
|---|---|---|---|
| appVersion | 43.0.0 | 44.0.0 | +1 versao documental |
| Branch principal | `kinocampus-V43.0-foundations` | `kinocampus-V44.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 28 | 29 | +V39 |
| Itens `check:structure` | 156 | 156 | preservado |
| Dossies pre-implementacao | 4 | 5 | +SEARCH-FTS-01 |
| Templates search/FTS | 0 | 1 | +V44 |
| JS funcional alterado | 0 | 0 | preservado |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `44.0.0`, branch `kinocampus-V44.0-foundations`, status `v44 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V39.md` arquivado via `git mv`
- [x] `docs/planning/v44-search-fts-preimplementation-dossier.md` criado
- [x] `docs/qa/reports/_TEMPLATE-search-fts-evidence.md` criado
- [x] Planning/QA indexes e matriz V39 apontam para V44
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V44
- [x] `docs/env-vars.md` e `docs/db-schema.md` reancorados para V44
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3046/3046 testes
- [x] Zero alteracoes em JS funcional, CSS de producao, HTMLs e migrations
