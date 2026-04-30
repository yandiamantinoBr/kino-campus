# Template - Manifesto de Patch Funcional

Use este template depois da rastreabilidade V52 e antes do primeiro edit funcional.

---

## 1. Identificacao

- **Data:**
- **Candidato:**
- **Branch base:**
- **Branch funcional planejada:**
- **Owner de implementacao:**
- **Owner de validacao:**
- **Decisao V52 vinculada:**

---

## 2. Filescope

| Arquivo | Tipo de mudanca | Motivo | Risco | Teste/smoke | Rollback |
|---|---|---|---|---|---|
| | | | | | |

---

## 3. Nao Escopo

Liste arquivos, camadas ou ambientes que nao podem ser tocados:

- TBD

---

## 4. Evidencias Planejadas

| Evidencia | Obrigatoria | Fonte | Redacao necessaria |
|---|---|---|---|
| `npm run check:all` | Sim | local | Nao |
| `npm test` | Sim | local | Nao |
| Playwright E2E | Depende de V32 | local | Nao |
| Lighthouse/LHCI | Depende de V33 | local/provider | Sim quando externo |
| Smoke manual | Depende do candidato | ambiente autorizado | Sim |

---

## 5. Criterio de Parada

Interromper o patch se:

- [ ] arquivo fora do filescope precisar ser alterado;
- [ ] teste obrigatorio falhar sem causa ambiental documentada;
- [ ] rollback por arquivo ficar inviavel;
- [ ] evidencia exigir secret, token, cookie ou dado pessoal;
- [ ] impacto visual nao previsto aparecer;
- [ ] owner de validacao nao estiver disponivel.

---

## 6. Go para Edicao

- **Manifesto completo:** Sim / Nao
- **Filescope fechado:** Sim / Nao
- **Rollback revisado:** Sim / Nao
- **Gates definidos:** Sim / Nao
- **Autorizado abrir patch funcional:** Sim / Nao
