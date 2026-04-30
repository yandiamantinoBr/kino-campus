# V39 - Matriz de Candidatos Funcionais

**Versao:** v39.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, SQL, secrets, providers ou CI

---

## 1. Objetivo

Definir uma fila inicial de candidatos para a primeira versao funcional futura. A V39 nao escolhe
nem implementa o pacote; ela classifica opcoes com base nos gates V25-V38 para evitar misturar
auth, SQL, provider, CSS e admin no mesmo ciclo.

---

## 2. Candidatos

| ID | Trilha | Prioridade | Entrada obrigatoria | Gates obrigatorios | Estado |
|---|---|---|---|---|---|
| AUTH-CB-01 | Signup callback real | P0 | Runbook V25, matriz V31, gate V37, rollback V38, dossie V40 | `check:all`, Jest, Playwright V32, evidencia auth real | Bloqueado ate ambiente real |
| PROFILE-AV-01 | Avatar/profile storage | P0 | Runbook V25, Supabase Advisor V29, matriz V31, dossie V41 | `check:all`, Jest, RLS/storage smoke, rollback R3 | Bloqueado ate policies reais |
| ADMIN-MOD-01 | Admin/moderacao | P1 | Matriz V31, runbook V25, dossie V42 | `check:all`, Jest, Playwright admin, smoke manual, controle negativo nao-admin | Bloqueado ate usuario admin real |
| NOTIF-SB-01 | Provider sandbox email/WhatsApp | P1 | Checklist V30, secrets sandbox, rollback V38, dossie V43 | `check:all`, Jest, provider sandbox, fail-closed, batch 1 controlado | Bloqueado ate sandbox |
| SEARCH-FTS-01 | Unaccent/FTS isolado | P1 | Auditoria V28, ambiente SQL isolado, dossie V44 | `check:all`, Jest, SQL smoke, rollback R3, comparativo antes/depois | Bloqueado ate banco isolado |
| CSS-SM-01 | Ajuste visual pequeno | P2 | Gate V27, politicas V32/V33, ledger V35 | `check:all`, Jest, Playwright/LHCI aplicavel, baseline visual | Bloqueado ate baseline |
| PUBLIC-A11Y-01 | Copy/a11y/i18n pontual | P2 | Plano V34, rota/componente identificado | `check:all`, Jest, a11y/manual por rota | Aguardando escopo |

---

## 3. Regra de Escolha

O primeiro pacote funcional futuro deve cumprir todos estes criterios:

1. uma unica trilha;
2. evidencia reproduzivel ou decisao Bloqueado registrada;
3. filescope menor que uma area inteira do app;
4. rollback classificado conforme V38;
5. gates proporcionais definidos antes do patch;
6. zero dependencia de secret real no repositorio.

---

## 4. Filescope Inicial Esperado

| Candidato | Filescope inicial permitido | Fora de escopo |
|---|---|---|
| AUTH-CB-01 | Auth UI/API, testes auth, docs QA | CSS amplo, provider externo, SQL sem evidencia |
| PROFILE-AV-01 | Profile/avatar adapter, storage docs, testes direcionados | Redesign de perfil, provider externo |
| ADMIN-MOD-01 | Controllers/admin relacionados, testes admin | Alterar rotas ou permissao sem RLS validado |
| NOTIF-SB-01 | Edge/provider docs e sandbox controlado | Ativar envio real para usuarios |
| SEARCH-FTS-01 | Migration spike isolado, RPC/indice em ambiente teste | Alterar producao sem rollback |
| CSS-SM-01 | Um componente/rota visual por vez | Split CSS amplo |
| PUBLIC-A11Y-01 | Copy/ARIA/foco de uma rota por vez | Refactor visual amplo |

---

## 5. Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem ambiente real para auth/admin/profile | Bloqueado |
| Sem rollback R3 para SQL/storage | No-Go |
| Provider sem sandbox/fail-closed | No-Go |
| CSS sem baseline visual antes/depois | No-Go |
| Patch misturando duas trilhas | No-Go |
| Evidencia completa, filescope pequeno, rollback testavel | Go condicionado aos gates |

---

## 6. Saida Esperada

Antes de abrir qualquer branch funcional futura, preencher:

- `docs/qa/reports/_TEMPLATE-functional-entry-gate.md`;
- `docs/qa/reports/_TEMPLATE-rollback-evidence.md`;
- `docs/qa/reports/_TEMPLATE-functional-candidate.md` quando houver mais de um candidato viavel.

Para `AUTH-CB-01`, preencher tambem `docs/qa/reports/_TEMPLATE-auth-callback-evidence.md`
conforme `docs/planning/v40-auth-callback-preimplementation-dossier.md`.

Para `PROFILE-AV-01`, preencher tambem `docs/qa/reports/_TEMPLATE-profile-avatar-evidence.md`
conforme `docs/planning/v41-profile-avatar-preimplementation-dossier.md`.

Para `ADMIN-MOD-01`, preencher tambem `docs/qa/reports/_TEMPLATE-admin-moderation-evidence.md`
conforme `docs/planning/v42-admin-moderation-preimplementation-dossier.md`.

Para `NOTIF-SB-01`, preencher tambem `docs/qa/reports/_TEMPLATE-notification-provider-evidence.md`
conforme `docs/planning/v43-notification-provider-preimplementation-dossier.md`.

Para `SEARCH-FTS-01`, preencher tambem `docs/qa/reports/_TEMPLATE-search-fts-evidence.md`
conforme `docs/planning/v44-search-fts-preimplementation-dossier.md`.
