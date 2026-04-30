# Report V57 - PUBLIC-A11Y-01 Post Card Author Avatar Alt

**Candidato:** `PUBLIC-A11Y-01`
**Versao:** `v57.0.0`
**Data:** `2026-04-30`
**Ambiente:** local
**Rota/componente:** `KCUtils.renderPostCard` / avatar do autor

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
| Patches V54-V56 preservados | Sim |

---

## 2. Classificacao

| Campo | Valor |
|---|---|
| Dimensao | semantica / texto alternativo |
| Severidade | P2 |
| Usuario afetado | publico |
| Ferramenta/evidencia | Jest direcionado + gates locais |
| Gate visual necessario | Nao |

---

## 3. Manifesto de Patch

| Arquivo | Tipo de mudanca | Motivo | Risco | Teste/smoke | Rollback |
|---|---|---|---|---|---|
| `assets/js/utils/kc-utils.presentation.js` | funcional pontual | avatar do autor usava apenas o primeiro nome no `alt`, reduzindo contexto para leitor de tela | baixo; altera apenas atributo `alt` no HTML gerado do card | suites a11y/unit direcionadas + `check:all` + `npm test` | reverter `authorAvatarAlt` e o `alt` anterior |
| `tests/a11y/a11y.test.js` | cobertura a11y direcionada | proteger nome completo no `alt` quando autor vem do post | baixo; teste estatico de HTML gerado | suite a11y direcionada | remover novo caso |
| `tests/unit/kc-utils-presentation.test.js` | cobertura unit direcionada | proteger nome completo quando autor vem de `KCAPI.getAuthorById` | baixo; assertion adicional em teste existente | suite unit direcionada | remover assertion |

Nao escopo: CSS, HTML estatico, SQL, migrations, providers, secrets, admin, auth, profile/avatar, busca e notificacoes.

---

## 4. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Estado atual reproduzido | Passou | leitura do codigo: `alt` usava `String(authorName).split(' ')[0]` |
| Autor vindo do post validado | Passou | `npm test -- tests/a11y/a11y.test.js` |
| Autor vindo de `KCAPI` validado | Passou | `npm test -- tests/unit/kc-utils-presentation.test.js` |
| Contraste/layout validado | Dispensado | sem CSS/HTML visual |

---

## 5. Gates

| Gate | Estado |
|---|---|
| `npm test -- tests/a11y/a11y.test.js` | executado; 35/35 testes |
| `npm test -- tests/unit/kc-utils-presentation.test.js` | executado; 27/27 testes |
| `npm run check:all` | executado; 5/5 validators verdes, 134/134 suites, 3054/3054 testes |
| `npm test` | executado; 134/134 suites, 3054/3054 testes |
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
