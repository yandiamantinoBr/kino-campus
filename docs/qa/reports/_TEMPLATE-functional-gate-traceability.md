# Template - Rastreabilidade de Gates Funcionais

Use este template imediatamente antes de abrir uma branch funcional futura.

---

## 1. Identificacao

- **Data:**
- **Branch funcional planejada:**
- **Candidato:**
- **Owner de implementacao:**
- **Owner de validacao:**
- **Decisao:** Go / No-Go / Aguardando evidencia

---

## 2. Matriz de Rastreabilidade

| Gate | Fonte | Evidencia anexada | Status | Observacao |
|---|---|---|---|---|
| Entrada funcional | V37 | | Pendente / OK / No-Go | |
| Rollback | V38 | | Pendente / OK / No-Go | |
| Candidato | V39 | | Pendente / OK / No-Go | |
| Dossie especifico | V40-V46 | | Pendente / OK / No-Go | |
| Evidencia externa | V48 | | Pendente / OK / N/A / No-Go | |
| Freeze de escopo | V49 | | Pendente / OK / No-Go | |
| Intake funcional | V50 | | Pendente / OK / No-Go | |
| Registro No-Go | V51 | | Pendente / Resolvido / Mantido / N/A | |

---

## 3. Lacunas

| Lacuna | Impacto | Bloqueante | Condicao de resolucao |
|---|---|---|---|
| | | Sim / Nao | |

---

## 4. Checks Locais Planejados

- [ ] `npm run check:all`
- [ ] `npm test`
- [ ] `npm run test:e2e` quando obrigatorio por V32
- [ ] `npm run lhci` quando obrigatorio por V33
- [ ] smoke manual quando ambiente real for necessario

---

## 5. Decisao Final

- **Resultado:** Go / No-Go
- **Justificativa:**
- **Filescope autorizado:**
- **Rollback autorizado:**
- **Data da proxima revisao:**

---

## 6. Redacao

Confirme antes de salvar:

- [ ] Sem secrets
- [ ] Sem tokens/cookies
- [ ] Sem dados pessoais
- [ ] Sem screenshots nao redigidos
- [ ] Sem URLs assinadas
