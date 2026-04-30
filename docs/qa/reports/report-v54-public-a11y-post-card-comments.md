# Report V54 - PUBLIC-A11Y-01 Post Card Comments

**Candidato:** `PUBLIC-A11Y-01`
**Versao:** `v54.0.0`
**Data:** `2026-04-30`
**Ambiente:** local
**Rota/componente:** `KCUtils.renderPostCard` / link `.kc-comment-link`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Plano V34 revisado | Sim |
| Rota/componente unico definido | Sim |
| Dimensao afetada classificada | Sim |
| Impacto para usuario descrito | Sim |
| Rollback V38 preparado | Sim - R1 por arquivo |
| Manifesto V53 aplicavel | Sim |

---

## 2. Classificacao

| Campo | Valor |
|---|---|
| Dimensao | semantica / nome acessivel |
| Severidade | P2 |
| Usuario afetado | publico |
| Ferramenta/evidencia | Jest direcionado + gates locais |
| Gate visual necessario | Nao |

---

## 3. Manifesto de Patch

| Arquivo | Tipo de mudanca | Motivo | Risco | Teste/smoke | Rollback |
|---|---|---|---|---|---|
| `assets/js/utils/kc-utils.presentation.js` | funcional pontual | `renderPostCard` ignorava `comments_count` e rotulava o link de comentarios sem acao/contexto | baixo; afeta apenas HTML gerado do card | `tests/a11y/a11y.test.js` + `check:all` + `npm test` | reverter bloco de contagem/ARIA e atributo do icone |
| `tests/a11y/a11y.test.js` | cobertura a11y direcionada | proteger contagem `comments_count`, nome acessivel e icone decorativo | baixo; teste estatico de HTML gerado | suite a11y direcionada | remover novos casos |

Nao escopo: CSS, HTML estatico, SQL, migrations, providers, secrets, admin, auth, profile/avatar, busca e notificacoes.

---

## 4. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Estado atual reproduzido | Passou | leitura do codigo: `comments_count` nao era fallback de `comentarios` |
| Nome acessivel/semantica validado | Passou | `npm test -- tests/a11y/a11y.test.js` |
| Icone decorativo validado | Passou | `fa-comment` com `aria-hidden="true"` |
| Contraste/layout validado | Dispensado | sem CSS/HTML visual |
| Copy/i18n validado | Dispensado | aria-label gerado dinamicamente em pt-BR simples |

---

## 5. Gates

| Gate | Estado |
|---|---|
| `npm test -- tests/a11y/a11y.test.js` | executado; 29/29 testes |
| `npm run check:all` | executado; 5/5 validators verdes |
| `npm test` | executado; 134/134 suites, 3048/3048 testes |
| Playwright a11y | dispensado; componente coberto por Jest e sem fluxo de teclado novo |
| Baseline visual V27/V45 | dispensado; sem alteracao visual/CSS |
| Rollback V38 | R1 por arquivo |

---

## 6. Decisao

| Decisao | Motivo |
|---|---|
| Go | Patch tem filescope pequeno, rollback simples, teste direcionado e nao depende de ambiente externo |

---

## 7. Redacao

Sem dados pessoais, screenshots, secrets, tokens, cookies ou URLs externas.
