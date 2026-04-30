# Candidato Funcional - TEMPLATE

**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`

---

## 1. Identificacao

| Campo | Valor |
|---|---|
| ID do candidato | `<AUTH-CB-01/PROFILE-AV-01/...>` |
| Trilha | `<auth/profile/admin/provider/search/CSS/a11y>` |
| Prioridade | `<P0/P1/P2>` |
| Artefatos-fonte | `<docs/...>` |

---

## 2. Evidencia de Entrada

| Item | Estado |
|---|---|
| Problema reproduzido | `<Passou/Falhou/Bloqueado>` |
| Ambiente validado | `<sim/nao/bloqueado>` |
| Gate V37 preenchido | `<sim/nao>` |
| Rollback V38 preenchido | `<sim/nao>` |

---

## 3. Escopo

- Arquivos permitidos:
- Arquivos proibidos:
- Dados/secrets envolvidos:
- Fora de escopo:

---

## 4. Gates

| Gate | Estado planejado |
|---|---|
| `npm run check:all` | Obrigatorio |
| `npm test` | Obrigatorio |
| Playwright | `<obrigatorio/recomendado/nao aplicavel>` |
| LHCI | `<obrigatorio/recomendado/nao aplicavel>` |
| SQL/ops | `<obrigatorio/recomendado/nao aplicavel>` |
| Smoke manual | `<obrigatorio/recomendado/nao aplicavel>` |

---

## 5. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |
