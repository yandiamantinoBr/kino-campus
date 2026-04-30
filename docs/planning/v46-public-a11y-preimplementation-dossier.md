# V46 - Dossie Pre-Implementacao PUBLIC-A11Y-01

**Versao:** v46.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, copy, i18n, testes, SQL, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P2 `PUBLIC-A11Y-01` antes de qualquer correcao de copy, ARIA, foco, contraste
ou i18n. O alvo e validar uma rota/componente por vez, com evidencia atual, severidade, impacto para
usuario, proposta reversivel e gate de teste antes de abrir patch funcional.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `PUBLIC-A11Y-01` |
| Trilha | Copy/a11y/i18n pontual |
| Prioridade | P2 |
| Risco principal | Silenciar ferramenta ou alterar copy/ARIA sem melhorar experiencia real; regressao de foco, contraste ou nomes acessiveis |
| Estado atual | Bloqueado ate rota/componente unico, evidencia redigida e teste/gate definido |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Plano V34 revisado | `docs/qa/v34-a11y-i18n-reconciliation-plan.md` | Sim |
| Rota/componente unico definido | Template V46 | Sim |
| Dimensao afetada classificada | V34, template V46 | Sim |
| Impacto para usuario descrito | V34 | Sim |
| Severidade P0/P1/P2 definida | V34 | Sim |
| Teste/gate aplicavel escolhido | `tests/a11y/`, Playwright a11y, manual | Sim |
| Rollback V38 preenchido como R1/R2 | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | Sim |
| Baseline visual V27 se envolver contraste/CSS | `docs/qa/v27-visual-a11y-regression-gate.md` | Sim quando aplicavel |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| Uma rota/componente publico por branch | Redesign visual |
| Texto/copy localizada e reversivel | Alterar CSS sem gate V27/V45 |
| Atributo ARIA/label/foco pontual | Refactor i18n amplo |
| `assets/js/core/kc-i18n.js` somente se chave pontual exigir | Mudar runtime de auth/profile/admin junto |
| testes a11y/i18n direcionados em `tests/` | Remover ou reduzir testes a11y existentes |
| docs QA/ops relacionados | Alterar banco, provider ou secrets |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Suite a11y/i18n direcionada | Obrigatorio se houver teste existente aplicavel |
| Playwright a11y | Obrigatorio se V32 classificar fluxo como E2E |
| Validacao manual de teclado/foco | Obrigatorio se foco/modal/popover for afetado |
| Baseline visual V27/V45 | Obrigatorio se contraste ou layout forem afetados |
| Rollback V38 classe R1/R2 | Obrigatorio |
| Evidencia redigida | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem rota/componente unico | Bloqueado |
| Sem impacto de usuario demonstravel | Bloqueado |
| Alteracao ARIA apenas para silenciar ferramenta | No-Go |
| Contraste/layout sem baseline visual | No-Go |
| Copy/ARIA pontual com teste/gate e rollback | Go condicionado a branch funcional |
| Mudanca exige refactor i18n amplo | No-Go; quebrar em dossie separado |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-public-a11y-evidence.md` antes de abrir qualquer branch
funcional para `PUBLIC-A11Y-01`.
