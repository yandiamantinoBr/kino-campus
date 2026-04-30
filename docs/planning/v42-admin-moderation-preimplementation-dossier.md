# V42 - Dossie Pre-Implementacao ADMIN-MOD-01

**Versao:** v42.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P1 `ADMIN-MOD-01` antes de qualquer implementacao funcional. O alvo e
validar admin/moderacao com usuario admin real, controle negativo de usuario nao-admin, rotas
administrativas, RPC/policies envolvidas e evidencia redigida antes de tocar controllers, adapters,
HTML, RLS ou dashboard.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `ADMIN-MOD-01` |
| Trilha | Admin/moderacao |
| Prioridade | P1 |
| Risco principal | Usuario sem permissao acessar ou executar acao administrativa; usuario admin nao conseguir moderar conteudo real |
| Estado atual | Bloqueado ate usuario admin real, controle nao-admin e evidencia Playwright/manual redigida |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Usuario admin real/teste autorizado | Runbook V25, matriz V31 | Sim |
| Usuario nao-admin para controle negativo | Runbook V25 | Sim |
| Acesso a `admin/moderation.html` validado com ambos perfis | Template V42 | Sim |
| Acoes de moderacao mapeadas com efeito esperado | Template V42, contratos existentes | Sim |
| Playwright admin atual executado ou bloqueio documentado | `tests/e2e/admin-moderation.spec.js`, `tests/e2e/admin-pages.spec.js` | Sim |
| Gate V37 preenchido | `docs/qa/reports/_TEMPLATE-functional-entry-gate.md` | Sim |
| Rollback V38 preenchido como R2/R3 conforme filescope | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | Sim |
| Candidato V39 confirmado | `docs/qa/reports/_TEMPLATE-functional-candidate.md` | Sim |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| `assets/js/api/admin-shell.js` | Redesign visual do admin |
| `assets/js/adapters/supabase/supabase.admin.adapter.js` | Alterar auth/signup/profile em paralelo |
| `assets/js/controllers/admin/admin-moderation.controller.js` | Criar role/policy sem rollback R3 |
| `assets/js/controllers/admin/admin-reports.controller.js` | Alterar rotas publicas |
| `assets/js/controllers/admin/admin-dashboard.shared.js` se guard comum exigir | Provider externo ou notificacao |
| `tests/e2e/admin-moderation.spec.js` e testes direcionados | Split CSS |
| docs QA/ops relacionados | Secret, token ou dado sensivel no repo |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Playwright admin/moderation | Obrigatorio antes de Go, ou bloqueio de ambiente documentado |
| Smoke manual admin autenticado | Obrigatorio antes de Go |
| Smoke negativo usuario nao-admin | Obrigatorio antes de Go |
| RLS/RPC smoke | Obrigatorio se role, RPC, policy ou migration forem tocadas |
| Rollback V38 classe R2/R3 | Obrigatorio conforme filescope |
| Evidencia redigida | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem usuario admin real/teste autorizado | Bloqueado |
| Sem controle nao-admin | Bloqueado |
| Admin acessa, mas nao ha conteudo/report reproduzivel | Bloqueado para patch funcional; permitido planejar fixture manual |
| Necessidade de policy/RPC SQL sem rollback R3 | No-Go |
| Falha isolada em controller/adapter com evidencia e rollback | Go condicionado a branch funcional |
| Patch mistura admin com auth callback, avatar ou provider | No-Go |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-admin-moderation-evidence.md` antes de abrir qualquer branch
funcional para `ADMIN-MOD-01`.
