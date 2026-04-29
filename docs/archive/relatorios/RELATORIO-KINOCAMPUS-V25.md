# Relatorio KinoCampus V25 - Runbook de QA Real

**Versao:** v25.0.0
**Status:** Encerrada
**Periodo:** 2026-04-28 -> 2026-04-28
**Branch:** `kinocampus-V25.0-foundations`
**Tipo:** documental/QA-only

---

## 1. Objetivo

Preparar o proximo bloqueio P0 do backlog: QA autenticado em ambiente real. A V25 cria um runbook
operacional para validar signup callback, login, perfil/avatar, posts, interacoes, admin/moderacao,
RLS, notificacoes fail-closed e busca/feed sem executar credenciais reais nesta versao.

---

## 2. Escopo Entregue

| Item | Entrega |
|---|---|
| Runbook QA real | `docs/qa/v25-real-environment-qa-runbook.md` criado |
| QA map | `docs/qa/README.md` atualizado com a ordem de leitura V25 |
| Ledger | `docs/planning/v24-post-v23-backlog-ledger.md` atualizado para apontar o runbook V25 |
| Relatorios raiz | `RELATORIO-KINOCAMPUS-V20.md` movido via `git mv` para `docs/archive/relatorios/` |
| Metadados | `VERSION.json`, README, docs index, guia de IA, workflow Lighthouse e validators reancorados para V25 |

---

## 3. Nao Escopo

- Nenhuma execucao com credenciais reais.
- Nenhuma alteracao em JS funcional.
- Nenhuma alteracao em CSS de producao.
- Nenhuma alteracao em HTMLs.
- Nenhuma alteracao em migrations Supabase.
- Nenhuma ativacao de provider real.

---

## 4. Metricas

| Metrica | Antes (V24) | Depois (V25) | Delta |
|---|---|---|---|
| appVersion | 24.0.0 | 25.0.0 | +1 versao documental |
| Branch principal | `kinocampus-V24.0-foundations` | `kinocampus-V25.0-foundations` | alinhada |
| RELATORIOs na raiz | 5 | 5 | politica preservada |
| RELATORIOs em `docs/archive/relatorios/` | 9 | 10 | +V20 |
| Itens `check:structure` | 156 | 156 | preservado |
| Artefatos novos de QA | 0 | 1 | +runbook V25 |
| JS funcional alterado | 0 | 0 | preservado |
| CSS de producao alterado | 0 | 0 | preservado |
| HTML alterado | 0 | 0 | preservado |
| Supabase migrations alteradas | 0 | 0 | preservado |

---

## 5. Definition of Done

- [x] `VERSION.json` em `25.0.0`, branch `kinocampus-V25.0-foundations`, status `v25 encerrada`
- [x] `docs/qa/v25-real-environment-qa-runbook.md` criado
- [x] `RELATORIO-KINOCAMPUS-V20.md` arquivado via `git mv`
- [x] Indices de archive e QA atualizados
- [x] README, `docs/index.md`, guia de IA, validators e workflow alinhados a V25
- [x] `docs/env-vars.md` e `docs/db-schema.md` reancorados para V25
- [x] `npm run check:all` 5/5 verde
- [x] `npm test` 134/134 suites, 3046/3046 testes
- [x] Zero alteracoes em JS funcional, CSS de producao, HTMLs e migrations
