# V43 - Dossie Pre-Implementacao NOTIF-SB-01

**Versao:** v43.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, edge functions, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P1 `NOTIF-SB-01` antes de qualquer configuracao ou patch funcional. O alvo e
validar providers reais de email/WhatsApp em sandbox, com destino controlado, opt-in documentado,
logs redigidos, fail-closed preservado e rollback definido antes de qualquer envio real.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `NOTIF-SB-01` |
| Trilha | Provider sandbox email/WhatsApp |
| Prioridade | P1 |
| Risco principal | Envio acidental para usuario real, vazamento de secret ou provider quebrando fluxo quando ausente |
| Estado atual | Bloqueado ate sandbox, destino controlado, opt-in e evidencia redigida |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Checklist V30 preenchido por canal | `docs/ops/v30-notification-provider-sandbox-checklist.md` | Sim |
| Ambiente sandbox/preview isolado confirmado | V30, V38 | Sim |
| Presenca booleana de secrets sem valores | V30 | Sim |
| Usuario/destino de teste com opt-in redigido | V30 | Sim |
| Dry-run ou bloqueio documentado | Template V43 | Sim |
| Dispatch manual batch 1, se permitido | Template V43 | Sim |
| Logs `notification_delivery_attempts` e `notification_dispatch_runs` redigidos | Template V43 | Sim |
| Fail-closed `provider_not_configured` validado | Testes existentes, V30 | Sim |
| Gate V37 preenchido | `docs/qa/reports/_TEMPLATE-functional-entry-gate.md` | Sim |
| Rollback V38 preenchido como R2/R3 conforme filescope | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | Sim |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| `supabase/functions/kc-dispatch-notification-outbox/index.ts` | Ativar envio real em producao |
| `supabase/functions/notify-admin-reports-threshold/index.ts` | Commitar secret, token, account id ou endpoint privado |
| `assets/js/api/kc-api.notifications.js` | Alterar auth, perfil, admin ou feed em paralelo |
| `assets/js/adapters/supabase/supabase.notifications.adapter.js` | Migration SQL sem rollback R3 |
| `assets/js/core/kc-notifications.js` se UI de estado exigir | Envio WhatsApp sem opt-in |
| testes de notificacao direcionados em `tests/` | Scheduler recorrente sem batch manual validado |
| docs QA/ops relacionados | Redesign visual ou CSS |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Suites de notificacao direcionadas | Obrigatorio antes de Go |
| Sandbox provider por canal | Obrigatorio antes de Go |
| Dry-run ou justificativa de indisponibilidade | Obrigatorio |
| Dispatch manual batch 1 | Obrigatorio se provider permitir |
| Fail-closed sem provider | Obrigatorio |
| Rollback V38 classe R2/R3 | Obrigatorio conforme filescope |
| Evidencia redigida | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem sandbox isolado | Bloqueado |
| Sem opt-in para destino WhatsApp | No-Go |
| Secret real precisaria entrar no repo | No-Go |
| Provider ausente quebra app em vez de falhar fechado | No-Go para go-live; Go condicionado a patch pequeno de fail-closed |
| Batch 1 enviado para destino controlado com logs e rollback | Go sandbox condicionado aos gates |
| Qualquer envio para base real sem aprovacao explicita | No-Go |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-notification-provider-evidence.md` antes de abrir qualquer branch
funcional ou operacional para `NOTIF-SB-01`.
