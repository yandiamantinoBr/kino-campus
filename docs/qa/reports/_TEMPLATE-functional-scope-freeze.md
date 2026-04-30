# Template - Freeze de Escopo Funcional

**Versao base:** v49.0.0
**Data:** YYYY-MM-DD
**Branch funcional pretendida:** `feature/vXX.Y.Z-descricao`
**Candidato:** `AUTH-CB-01` / `PROFILE-AV-01` / `ADMIN-MOD-01` / `NOTIF-SB-01` / `SEARCH-FTS-01` / `CSS-SM-01` / `PUBLIC-A11Y-01`

---

## 1. Decisao de Entrada

| Campo | Valor |
|---|---|
| Gate V37 preenchido | Sim / Nao |
| Rollback V38 preenchido | Sim / Nao |
| Selecao V47 preenchida | Sim / Nao |
| Evidencia V48 aplicavel preenchida | Sim / Nao / Nao aplicavel |
| Template especifico do candidato preenchido | Sim / Nao |
| Decisao inicial | Go / Go condicionado / No-Go / Bloqueado |

---

## 2. Filescope Congelado

| Tipo | Arquivos permitidos | Arquivos proibidos |
|---|---|---|
| JS | PENDENTE | PENDENTE |
| CSS | PENDENTE | PENDENTE |
| HTML | PENDENTE | PENDENTE |
| SQL/migrations | PENDENTE | PENDENTE |
| Docs/QA | PENDENTE | PENDENTE |
| Config/CI | PENDENTE | PENDENTE |

Qualquer arquivo fora da lista permitida exige novo freeze.

---

## 3. Gates Congelados

| Gate | Obrigatorio? | Comando/evidencia |
|---|---|---|
| `npm run check:all` | Sim | PENDENTE |
| `npm test` | Sim | PENDENTE |
| Playwright | Conforme V32 | PENDENTE |
| LHCI | Conforme V33 | PENDENTE |
| Smoke manual | Conforme candidato | PENDENTE |
| Controle negativo | Conforme candidato | PENDENTE |

---

## 4. Rollback Congelado

| Campo | Valor |
|---|---|
| Classe V38 | R1 / R2 / R3 |
| Passo de rollback | PENDENTE |
| Evidencia de rollback antes do patch | PENDENTE |
| Estado aceito apos rollback | PENDENTE |

---

## 5. Criterios de Interrupcao

- [ ] Arquivo fora do filescope aparece no diff.
- [ ] Gate obrigatorio nao pode ser executado.
- [ ] Evidencia externa exige secret no repo.
- [ ] Rollback nao e testavel.
- [ ] Patch passa a depender de outro candidato.

Se qualquer item acima ocorrer, declarar No-Go e encerrar a tentativa.
