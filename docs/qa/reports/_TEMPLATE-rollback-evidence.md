# Evidencia de Rollback - TEMPLATE

**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/producao/redigido>`

---

## 1. Mudanca

| Campo | Valor |
|---|---|
| Tipo | `<doc-only/JS/CSS/HTML/SQL/provider/config>` |
| Classe de rollback | `<R0/R1/R2/R3/R4>` |
| Branch/commit base | `<branch/sha>` |
| Artefatos-fonte | `<docs/...>` |

---

## 2. Estado Antes

| Item | Evidencia |
|---|---|
| Ambiente validado | `<sim/nao/bloqueado>` |
| Dados afetados | `<nenhum/redigido>` |
| Screenshots/logs antes | `<caminho/redigido>` |
| Secrets envolvidos | `<nao/sim-redigido>` |

---

## 3. Plano de Reversao

### Passos

1. `<passo>`
2. `<passo>`
3. `<passo>`

### Arquivos/Dados

- Arquivos revertidos:
- Dados persistidos:
- Provider/dashboard:
- Cache/localStorage:

---

## 4. Validacao Pos-Rollback

| Gate | Estado esperado |
|---|---|
| `npm run check:all` | Pendente |
| `npm test` | Pendente |
| Playwright/LHCI | Pendente/Nao aplicavel |
| SQL/ops | Pendente/Nao aplicavel |
| Smoke manual | Pendente/Nao aplicavel |

---

## 5. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 6. Observacoes

- Nao registrar secret, token, magic link, URL assinada, payload privado ou dado pessoal bruto.
- Se a reversao depender de dashboard externo, registrar owner e janela de execucao.
- Se rollback for inseguro ou incompleto, bloquear a implementacao funcional.
