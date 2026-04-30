# Evidencia CSS Small Change - TEMPLATE

**Candidato:** `CSS-SM-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/redigido>`
**Rota/componente:** `<rota/componente unico>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Gate V27 revisado | `<sim/nao>` |
| Ledger V35 revisado | `<sim/nao>` |
| Rota/componente unico definido | `<sim/nao>` |
| Arquivo CSS candidato definido | `<sim/nao>` |
| Rollback V38 preparado | `<sim/nao>` |

---

## 2. Baseline Antes

| Viewport | Resultado | Evidencia |
|---|---|---|
| 390x844 | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| 768x1024 | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| 1366x768 | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| 1440x900 | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 3. Comparativo Depois

| Check | Resultado | Evidencia |
|---|---|---|
| Sem overflow horizontal inesperado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Texto nao cortado em botoes/cards | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Foco visivel preservado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Contraste sem regressao obvia | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Estado interativo relevante preservado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 4. Gates Relacionados

| Gate | Estado |
|---|---|
| `npm run check:all` | `<executado/pendente>` |
| `npm test` | `<executado/pendente>` |
| Playwright V32 | `<obrigatorio/executado/dispensado/bloqueado>` |
| LHCI V33 | `<executado/bloqueado/dispensado>` |
| Rollback V38 | `<preenchido/pendente>` |

---

## 5. Diagnostico

- Problema visual observado:
- Arquivo CSS candidato:
- Seletores provaveis:
- Rotas afetadas:
- Evidencia antes:
- Evidencia depois:
- Filescope sugerido:

---

## 6. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 7. Redacao Obrigatoria

- Nao anexar screenshots com dados pessoais sem mascaramento.
- Nao usar baseline parcial quando a mudanca afetar componente compartilhado.
- Nao aprovar patch visual sem caminho de rollback e comparativo antes/depois.
