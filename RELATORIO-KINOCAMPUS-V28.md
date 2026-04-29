# Relatorio KinoCampus V28 - Auditoria `unaccent`/FTS Pre-Migration

**Versao:** v28.0.0
**Status:** Encerrada
**Periodo:** 2026-04-28 -> 2026-04-28
**Branch:** `kinocampus-V28.0-foundations`
**Tipo:** documental/ops-only

---

## 1. Objetivo

Mapear o impacto de tratar o advisor `extension_in_public` para `unaccent` antes de qualquer migration.
A V28 transforma a pendencia PROD-005/SEC-002 em auditoria operacional, identificando dependencias em
helpers, indice GIN, RPC de busca e normalizacao de feed sem executar SQL e sem alterar migrations.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Auditoria ops | `docs/ops/v28-unaccent-fts-dependency-audit.md` criado |
| Runbook V19 | Referencia para auditoria V28 adicionada na secao `extension_in_public` |
| Ledger | `docs/planning/v24-post-v23-backlog-ledger.md` atualizado para refletir auditoria V28 |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V23.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, docs index, guia de IA, workflow Lighthouse e validators reancorados para V28 |

---

## 3. Nao Escopo

- Nenhuma execucao de SQL.
- Nenhuma migration Supabase alterada.
- Nenhuma mudanca em Dashboard Supabase.
- Nenhuma alteracao em JS funcional.
- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs.

---

## 4. Metricas

| Metrica | Antes (V27) | Depois (V28) | Delta |
|---|---|---|---|
| appVersion | 27.0.0 | 28.0.0 | +1 versao documental |
| Branch principal | `kinocampus-V27.0-foundations` | `kinocampus-V28.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 12 | 13 | +V23 |
| Itens `check:structure` | 156 | 156 | preservado |
| Auditorias ops ativas | V19 runbook | V19 runbook + V28 unaccent/FTS audit | +1 |
| JS funcional alterado | 0 | 0 | preservado |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `28.0.0`, branch `kinocampus-V28.0-foundations`, status `v28 encerrada`
- [x] `RELATORIO-KINOCAMPUS-V23.md` arquivado via `git mv`
- [x] `docs/ops/v28-unaccent-fts-dependency-audit.md` criado
- [x] Runbook V19 e ledger V24 apontam para auditoria V28
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V28
- [x] `docs/env-vars.md` e `docs/db-schema.md` reancorados para V28
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3046/3046 testes
- [x] Zero alteracoes em JS funcional, CSS de producao, HTMLs e migrations
