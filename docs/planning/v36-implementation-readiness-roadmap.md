# V36 - Roadmap de Readiness para Implementacao Futura

**Versao:** v36.0.0
**Atualizado em:** 2026-04-28
**Escopo:** consolidacao documental; sem implementar runtime, CSS, HTML, SQL, secrets ou CI

---

## 1. Objetivo

Consolidar a ordem segura para transformar os inventarios e checklists V25-V35 em execucao futura.
Este roadmap nao substitui os documentos-fonte; ele aponta a sequencia recomendada, dependencias de
entrada, saidas esperadas e bloqueios de Go/No-Go.

---

## 2. Ordem Recomendada

| Ordem | Trilha | Entrada obrigatoria | Saida esperada |
|---:|---|---|---|
| 1 | QA autenticado real | Runbook V25, template V26, matriz V31 | Report com AUTH/PROFILE/POST/ADMIN/RLS Go/No-Go |
| 2 | Supabase Advisor | Checklist V29, acesso dashboard | Evidencia leaked password, avatar policies e scheduler |
| 3 | Unaccent/FTS | Auditoria V28, ambiente SQL isolado | Spike com impacto em wrappers/RPC/indice |
| 4 | Providers externos | Checklist V30, sandbox/secrets aprovados | Dispatch controlado por canal com rollback |
| 5 | Visual/a11y/i18n | Gate V27, politicas V32/V33, plano V34 | Baseline visual/a11y e backlog validado |
| 6 | CSS/layout | Ledger V35 e baseline aprovado | Mudanca pequena, reversivel e testada |
| 7 | Implementacao funcional | Evidencias das trilhas 1-6 + gates V37/V38 + matriz V39 | Patch funcional com gates proporcionais |

---

## 3. Regras de Go/No-Go

| Situacao | Decisao |
|---|---|
| Falta credencial, dashboard, provider ou ambiente isolado | Bloqueado |
| Falha P0 em auth, RLS, admin ou create-post | No-Go funcional |
| Falha de provider com fail-closed preservado | Go com ressalva operacional |
| Falha visual sem baseline antes/depois | No-Go para CSS |
| Falha LHCI por ambiente classificada pela V33 | Bloqueado, nao regressao automatica |
| Mudanca documental/metadados sem runtime | E2E/LHCI nao aplicavel, `check:all` obrigatorio |

---

## 4. Artefatos por Trilha

| Trilha | Artefatos |
|---|---|
| QA real | `docs/qa/v25-real-environment-qa-runbook.md`, `docs/planning/v26-qa-evidence-readiness.md`, `docs/qa/v31-authenticated-flow-triage-matrix.md` |
| Operacoes Supabase | `docs/ops/v19-operational-runbook.md`, `docs/ops/v29-supabase-advisor-evidence-checklist.md`, `docs/ops/v28-unaccent-fts-dependency-audit.md` |
| Providers | `docs/ops/v30-notification-provider-sandbox-checklist.md`, `docs/ops/vercel-supabase-invariants.md` |
| QA gates | `docs/qa/v27-visual-a11y-regression-gate.md`, `docs/qa/v32-e2e-gate-policy.md`, `docs/qa/v33-lhci-baseline-policy.md`, `docs/qa/reports/_TEMPLATE-functional-entry-gate.md`, `docs/qa/reports/_TEMPLATE-rollback-evidence.md`, `docs/qa/reports/_TEMPLATE-functional-candidate.md` |
| UX/CSS | `docs/qa/v34-a11y-i18n-reconciliation-plan.md`, `docs/planning/v35-css-readiness-ledger.md`, `docs/architecture/css-architecture.md` |

---

## 5. Primeiro Pacote Funcional Seguro

O primeiro pacote funcional futuro deve ser escolhido apenas depois de uma rodada de evidencia real.
Preferir escopos pequenos:

1. correcao P0 comprovada em auth/callback ou RLS;
2. ajuste operacional Supabase aprovado e reversivel;
3. provider sandbox sem impacto em usuarios reais;
4. ajuste visual pequeno com baseline antes/depois.

Nao combinar CSS, JS, SQL e provider externo na mesma entrega.

---

## 6. Saida Esperada

Antes de abrir uma versao funcional, preencher `docs/qa/reports/_TEMPLATE-functional-entry-gate.md`
e, quando houver mudanca funcional, `docs/qa/reports/_TEMPLATE-rollback-evidence.md`; ou criar
report equivalente em `docs/ops/` com:

- trilha escolhida;
- artefatos-fonte usados;
- evidencia redigida;
- decisao Go/No-Go;
- rollback;
- gates que serao obrigatorios;
- filescope previsto.
- candidato escolhido quando houver mais de uma trilha viavel.

---

## 7. Bloqueios

- Nao implementar com base apenas em suposicao documental.
- Nao alterar Supabase producao sem ambiente isolado/rollback.
- Nao ativar providers reais sem sandbox e opt-in.
- Nao mexer em CSS sem baseline visual.
- Nao reduzir suites/testes para liberar pacote funcional.
