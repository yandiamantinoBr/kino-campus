# V41 - Dossie Pre-Implementacao PROFILE-AV-01

**Versao:** v41.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P0 `PROFILE-AV-01` da matriz V39 antes de qualquer implementacao. O alvo e
validar avatar/profile com Supabase Storage, policies manuais, RLS e comportamento de perfil real
sem misturar redesign visual, auth callback ou provider externo.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `PROFILE-AV-01` |
| Trilha | Profile/avatar storage |
| Prioridade | P0 |
| Risco principal | Usuario autenticado nao consegue persistir ou carregar avatar/perfil corretamente |
| Estado atual | Bloqueado ate ambiente real com usuario autenticado, bucket/policies e evidencia redigida |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Usuario autenticado real/teste autorizado | Runbook V25, matriz V31 | Sim |
| Bucket `kino-media` e caminho `profile-avatars/` validados | Supabase Dashboard/owner redigido | Sim |
| Policies de storage verificadas | Checklist V29 | Sim |
| Upload -> update profile -> reload -> render avatar | Template V41 | Sim |
| Gate V37 preenchido | `docs/qa/reports/_TEMPLATE-functional-entry-gate.md` | Sim |
| Rollback V38 preenchido como R3 se envolver policy/storage | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | Sim |
| Candidato V39 confirmado | `docs/qa/reports/_TEMPLATE-functional-candidate.md` | Sim |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| `assets/js/core/kc-profile.js` | Redesign de perfil |
| `assets/js/api/kc-api.profiles.js` | Alterar signup/callback |
| `assets/js/adapters/supabase/supabase.profile.adapter.js` | Provider externo |
| `assets/js/shared/account-profile.shared.js` se render exigir | Split CSS ou layout amplo |
| testes direcionados em `tests/` | Migration/policy sem ambiente isolado |
| docs QA/ops relacionados | Secret, signed URL ou token no repo |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Smoke manual autenticado | Obrigatorio antes de Go |
| Storage/RLS smoke | Obrigatorio se policy/storage for tocada |
| Rollback V38 classe R3 | Obrigatorio se envolver Supabase Storage/policy |
| Evidencia redigida | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem usuario autenticado real/teste autorizado | Bloqueado |
| Bucket/policies nao verificados | Bloqueado |
| Necessidade de policy SQL/storage sem rollback R3 | No-Go |
| Avatar falha reproduzida e filescope profile pequeno | Go condicionado a branch funcional |
| Necessidade de auth callback junto com avatar | No-Go; usar dossie V40 antes |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-profile-avatar-evidence.md` antes de abrir qualquer branch
funcional para `PROFILE-AV-01`.
