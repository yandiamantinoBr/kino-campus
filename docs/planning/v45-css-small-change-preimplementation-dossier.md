# V45 - Dossie Pre-Implementacao CSS-SM-01

**Versao:** v45.0.0
**Atualizado em:** 2026-04-29
**Escopo:** planejamento documental; sem alterar runtime, CSS, HTML, assets visuais, SQL, secrets, providers ou CI

---

## 1. Objetivo

Detalhar o candidato P2 `CSS-SM-01` antes de qualquer ajuste visual. O alvo e permitir somente um
patch CSS pequeno, reversivel e limitado a uma rota/componente, com baseline visual/a11y antes,
comparativo depois, Playwright/LHCI quando aplicavel e rollback claro.

---

## 2. Hipotese a Validar

| Campo | Valor |
|---|---|
| Candidato | `CSS-SM-01` |
| Trilha | Ajuste visual pequeno |
| Prioridade | P2 |
| Risco principal | Regressao visual silenciosa em rotas compartilhadas ou quebra de layout responsivo |
| Estado atual | Bloqueado ate baseline visual, rota/componente unico e rollback documentado |

---

## 3. Evidencia Obrigatoria Antes de Patch

| Evidencia | Fonte | Bloqueia implementacao se ausente |
|---|---|---|
| Gate visual/a11y V27 revisado | `docs/qa/v27-visual-a11y-regression-gate.md` | Sim |
| Ledger CSS V35 revisado | `docs/planning/v35-css-readiness-ledger.md` | Sim |
| Rota/componente unico definido | Template V45 | Sim |
| Screenshots baseline nos viewports afetados | Template V45 | Sim |
| Console sem erro proprio bloqueante | V27 | Sim |
| Playwright classificado pela V32 | `docs/qa/v32-e2e-gate-policy.md` | Sim |
| LHCI classificado pela V33 | `docs/qa/v33-lhci-baseline-policy.md` | Sim |
| Rollback V38 preenchido como R1/R2 | `docs/qa/reports/_TEMPLATE-rollback-evidence.md` | Sim |

---

## 4. Filescope Inicial

| Permitido somente se evidencia apontar necessidade | Fora de escopo |
|---|---|
| Um dos 5 CSS de producao, preferindo o menor arquivo afetado | Split CSS amplo |
| `assets/css/styles.css` somente para componente publico especifico | Alterar HTML para carregar CSS novo |
| `assets/css/kc-public-shell.css` se shell autenticado for alvo unico | Ativar `assets/css/future-split/` |
| `assets/css/admin-shell.css` se admin for alvo unico | Alterar JS para compensar layout |
| `assets/css/product.css` se `_product.html` for alvo unico | Mudanca simultanea em varias rotas |
| docs QA/ops relacionados | Redesign, tokens globais ou paleta ampla |

---

## 5. Gates Minimos

| Gate | Obrigatoriedade |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Baseline visual antes/depois | Obrigatorio |
| Viewports V27 afetados | Obrigatorio |
| Playwright E2E | Obrigatorio se V32 classificar como obrigatorio |
| LHCI | Obrigatorio quando ambiente permitir; bloqueio deve ser documentado |
| A11y manual/foco/contraste | Obrigatorio |
| Rollback V38 classe R1/R2 | Obrigatorio |

---

## 6. Decisoes Go/No-Go

| Situacao | Decisao |
|---|---|
| Sem baseline visual antes | Bloqueado |
| Patch afeta tokens globais sem mapa de impacto | No-Go |
| Patch mistura CSS, JS e HTML | No-Go |
| Rota/componente unico com diff visual aprovado | Go condicionado a branch funcional |
| LHCI falha por ambiente local documentado | Go condicionado a evidencia alternativa |
| Regressao visual ou a11y detectada sem rollback | No-Go |

---

## 7. Saida Esperada

Preencher `docs/qa/reports/_TEMPLATE-css-small-change-evidence.md` antes de abrir qualquer branch
funcional para `CSS-SM-01`.
