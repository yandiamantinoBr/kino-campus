# Template - Selecao de Readiness para Implementacao Funcional

**Versao base:** v47.0.0
**Data da avaliacao:** YYYY-MM-DD
**Responsavel:** NOME
**Branch pretendida:** `feature/vXX.Y.Z-descricao`

---

## 1. Candidato Selecionado

| Campo | Valor |
|---|---|
| ID do candidato | `AUTH-CB-01` / `PROFILE-AV-01` / `ADMIN-MOD-01` / `NOTIF-SB-01` / `SEARCH-FTS-01` / `CSS-SM-01` / `PUBLIC-A11Y-01` |
| Prioridade | P0 / P1 / P2 |
| Dossie fonte | `docs/planning/...` |
| Template especifico | `docs/qa/reports/...` |
| Decisao | Go / Go condicionado / No-Go / Bloqueado |

---

## 2. Evidencia de Desbloqueio

| Bloqueio original | Evidencia atual | Arquivo/link redigido | Resultado |
|---|---|---|---|
| Ambiente real / sandbox / baseline / rollback | PENDENTE | PENDENTE | Bloqueado |

---

## 3. Filescope Proposto

| Superficie | Arquivos permitidos | Arquivos proibidos nesta tentativa |
|---|---|---|
| JS runtime | PENDENTE | PENDENTE |
| CSS | PENDENTE | PENDENTE |
| HTML | PENDENTE | PENDENTE |
| SQL/migrations | PENDENTE | PENDENTE |
| Docs/QA | PENDENTE | PENDENTE |

Regra: se a tentativa precisar preencher mais de duas superficies tecnicas de alto risco, dividir o
pacote ou declarar No-Go.

---

## 4. Rollback

| Item | Resposta |
|---|---|
| Classe V38 | R1 / R2 / R3 |
| Passo de rollback testado antes do patch? | Sim / Nao |
| Evidencia anexada | PENDENTE |
| Estado esperado apos rollback | PENDENTE |

---

## 5. Gates

| Gate | Antes do patch | Depois do patch | Obrigatorio? |
|---|---|---|---|
| `npm run check:all` | PENDENTE | PENDENTE | Sim |
| `npm test` | PENDENTE | PENDENTE | Sim |
| Playwright | PENDENTE | PENDENTE | Conforme V32 |
| LHCI | PENDENTE | PENDENTE | Conforme V33 |
| Smoke manual | PENDENTE | PENDENTE | Conforme candidato |
| Controle negativo | PENDENTE | PENDENTE | Conforme candidato |

---

## 6. Decisao Final

- [ ] Go
- [ ] Go condicionado
- [ ] No-Go
- [ ] Bloqueado

Justificativa:

```text
PENDENTE
```

Assinatura/registro:

```text
PENDENTE
```
