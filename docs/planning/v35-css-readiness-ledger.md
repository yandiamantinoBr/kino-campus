# V35 - Ledger de Readiness para CSS

**Versao:** v35.0.0
**Atualizado em:** 2026-04-28
**Escopo:** planejamento documental; sem alterar CSS, HTML, JS ou assets visuais

---

## 1. Objetivo

Definir os pre-requisitos para qualquer split CSS, ajuste visual amplo ou refactor de layout futuro.
A V35 nao executa split, nao carrega stubs de `assets/css/future-split/` e nao altera estilos; ela
organiza gates, evidencias, rollback e ordem segura de intervencao.

---

## 2. Gates Obrigatorios Antes de CSS

| Gate | Fonte | Status esperado |
|---|---|---|
| Visual/a11y baseline | `docs/qa/v27-visual-a11y-regression-gate.md` | Report aprovado |
| Playwright E2E | `docs/qa/v32-e2e-gate-policy.md` | Obrigatorio para CSS/layout |
| Lighthouse/LHCI | `docs/qa/v33-lhci-baseline-policy.md` | Passou ou bloqueio justificado |
| A11y/i18n | `docs/qa/v34-a11y-i18n-reconciliation-plan.md` | Gaps conhecidos classificados |
| Estrutura CSS | `docs/architecture/css-architecture.md` | Confirmar arquivos carregados |
| Rollback | Branch/commit identificados | Reverter sem tocar dados |

---

## 3. Escopos Permitidos Futuramente

| Escopo | Condicao |
|---|---|
| Ajuste pequeno em `styles.css` | Gate visual minimo e E2E aplicavel |
| Ajuste em shell publico/admin | Visual baseline das rotas afetadas |
| Split parcial para arquivo ja carregado | Plano de carregamento e diff visual por rota |
| Ativacao de `future-split/` | Prova de ordem de carregamento e equivalencia visual |
| Remocao de regra antiga | Evidencia de nao uso ou substituicao equivalente |

---

## 4. Bloqueios

| Bloqueio | Motivo |
|---|---|
| Sem baseline visual executado | Nao ha comparacao confiavel |
| Sem E2E quando CSS afeta rota interativa | Pode quebrar fluxo sem aparecer em lint |
| Sem rollback claro | Ajuste visual precisa ser reversivel |
| Mudanca simultanea de CSS + JS + HTML | Dificulta isolar regressao |
| Alterar tokens sem mapa de impacto | Pode afetar toda a plataforma |

---

## 5. Ordem Recomendada

1. Rodar e registrar baseline visual/a11y V27.
2. Classificar necessidade de E2E pela politica V32.
3. Classificar LHCI pela politica V33.
4. Confirmar gaps a11y/i18n pela V34.
5. Definir escopo pequeno e reversivel.
6. Aplicar mudanca CSS em branch dedicada.
7. Reexecutar gates afetados.
8. Registrar antes/depois e rollback.

---

## 6. Saida Esperada

Antes de V19+ funcional tocar CSS, deve existir report em `docs/qa/reports/` com:

- rotas afetadas;
- screenshots antes/depois;
- Playwright quando obrigatorio;
- LHCI quando aplicavel;
- decisao Go/No-Go;
- rollback testado;
- lista de excecoes aceitas.

---

## 7. Nao Escopo

- Nao alterar `assets/css/styles.css`.
- Nao alterar `assets/css/kc-public-shell.css`.
- Nao alterar `assets/css/admin-shell.css`.
- Nao alterar `assets/css/product.css`.
- Nao ativar `assets/css/future-split/`.
- Nao modificar HTML para carregar novos estilos.
