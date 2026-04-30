# Evidencia Public A11y - TEMPLATE

**Candidato:** `PUBLIC-A11Y-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/redigido>`
**Rota/componente:** `<rota/componente unico>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Plano V34 revisado | `<sim/nao>` |
| Rota/componente unico definido | `<sim/nao>` |
| Dimensao afetada classificada | `<sim/nao>` |
| Impacto para usuario descrito | `<sim/nao>` |
| Rollback V38 preparado | `<sim/nao>` |

---

## 2. Classificacao

| Campo | Valor |
|---|---|
| Dimensao | `<idioma/foco/semantica/contraste/feedback/texto-dinamico/i18n-tecnico>` |
| Severidade | `<P0/P1/P2>` |
| Usuario afetado | `<publico/autenticado/admin/redigido>` |
| Ferramenta/evidencia | `<manual/jest/playwright/lhci/outro>` |
| Gate visual necessario | `<sim/nao>` |

---

## 3. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Estado atual reproduzido | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Teclado/foco validado | `<Passou/Falhou/Dispensado>` | `<caminho/redigido>` |
| Nome acessivel/semantica validado | `<Passou/Falhou/Dispensado>` | `<caminho/redigido>` |
| Contraste/layout validado | `<Passou/Falhou/Dispensado>` | `<caminho/redigido>` |
| Copy/i18n validado | `<Passou/Falhou/Dispensado>` | `<caminho/redigido>` |

---

## 4. Gates Relacionados

| Gate | Estado |
|---|---|
| `npm run check:all` | `<executado/pendente>` |
| `npm test` | `<executado/pendente>` |
| Tests a11y/i18n | `<executado/pendente/dispensado>` |
| Playwright a11y | `<executado/bloqueado/dispensado>` |
| Baseline visual V27/V45 | `<executado/bloqueado/dispensado>` |
| Rollback V38 | `<preenchido/pendente>` |

---

## 5. Diagnostico

- Gap observado:
- Impacto para usuario:
- Proposta de correcao:
- Teste/gate sugerido:
- Filescope sugerido:
- Risco de regressao:

---

## 6. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 7. Redacao Obrigatoria

- Nao usar dados pessoais em screenshots ou exemplos.
- Nao alterar ARIA/copy sem validar experiencia real do fluxo.
- Nao aprovar contraste/layout sem baseline visual quando aplicavel.
- Nao reduzir ou remover testes a11y/i18n existentes.
