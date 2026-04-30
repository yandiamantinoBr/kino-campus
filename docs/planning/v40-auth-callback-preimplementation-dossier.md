# V40 - Dossie Pre-Implementacao AUTH-CB-01

**Versao:** v40.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P0 `AUTH-CB-01` da matriz V39 antes de qualquer implementacao. O alvo e
validar signup, email institucional, callback/magic link e estado autenticado real com evidencia
redigida, filescope pequeno e rollback classificado.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `AUTH-CB-01` |
| Trilha | Auth/signup/callback |
| Prioridade | P0 |
| Risco principal | Usuario real nao consegue concluir cadastro ou retornar autenticado apos callback |
| Estado atual | Bloqueado ate ambiente real com email institucional, Supabase Auth e URL de callback validada |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Email institucional real ou conta teste autorizada | Runbook V25 | Sim |
| URL de callback configurada no Supabase Auth | Dashboard/owner redigido | Sim |
| Resultado signup -> email -> callback -> sessao | Template V40 | Sim |
| Matriz V31 preenchida para auth/profile | `docs/qa/v31-authenticated-flow-triage-matrix.md` | Sim |
| Gate V37 preenchido | `docs/qa/reports/_TEMPLATE-functional-entry-gate.md` | Sim |
| Rollback V38 preenchido | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | Sim |
| Candidato V39 confirmado | `docs/qa/reports/_TEMPLATE-functional-candidate.md` | Sim |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| `assets/js/core/kc-auth.ui.js` | Redesign visual de auth |
| `assets/js/api/kc-api.auth.js` | Alterar rotas Vercel |
| `assets/js/api/kc-api.client.js` se contrato exigir | Provider email externo |
| `assets/js/adapters/supabase/supabase.auth.adapter.js` | SQL/RLS sem evidencia |
| testes direcionados em `tests/` | Mudancas em CSS de producao |
| docs QA/ops relacionados | Qualquer secret ou token no repo |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Playwright auth/callback | Obrigatorio se houver ambiente local/preview com callback testavel |
| Smoke manual real | Obrigatorio antes de Go |
| Evidencia redigida | Obrigatorio |
| Rollback V38 | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem email institucional autorizado | Bloqueado |
| Callback nao configurado no Supabase Auth | Bloqueado |
| Magic link/token exposto em evidencia | No-Go ate redigir e rotacionar quando necessario |
| Falha reproduzida e filescope auth pequeno | Go condicionado a branch funcional |
| Necessidade de SQL/provider/CSS junto com auth | No-Go; dividir trilhas |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-auth-callback-evidence.md` antes de abrir qualquer branch
funcional para `AUTH-CB-01`.
