# Gate de Entrada Funcional - TEMPLATE

**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/producao/redigido>`

---

## 1. Trilha

| Campo | Valor |
|---|---|
| Tipo | `<QA real/Supabase/provider/CSS/bug funcional>` |
| Prioridade | `<P0/P1/P2>` |
| Artefatos-fonte | `<docs/...>` |
| Issue/relatorio origem | `<link/caminho/redigido>` |

---

## 2. Evidencia

| Item | Resultado |
|---|---|
| Problema reproduzido | `<Passou/Falhou/Bloqueado>` |
| Evidencia anexada | `<caminho/redigido>` |
| Ambiente validado | `<sim/nao/bloqueado>` |
| Dados sensiveis redigidos | `<sim/nao>` |

---

## 3. Escopo

### Arquivos permitidos

- `<arquivo ou diretorio>`

### Arquivos proibidos

- `<arquivo ou diretorio>`

### Fora de escopo

- `<mudancas explicitamente proibidas>`

---

## 4. Gates Planejados

| Gate | Obrigatorio | Estado |
|---|---|---|
| `npm run check:all` | Sim | Pendente |
| `npm test` | Sim | Pendente |
| Playwright E2E | Conforme V32 | Pendente/Nao aplicavel |
| LHCI | Conforme V33 | Pendente/Nao aplicavel |
| Visual/a11y | Conforme V27/V34 | Pendente/Nao aplicavel |
| SQL/ops | Conforme trilha | Pendente/Nao aplicavel |

---

## 5. Rollback

- Passo 1:
- Passo 2:
- Validacao pos-rollback:

---

## 6. Go/No-Go

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 7. Observacoes

- Nenhum secret, token, magic link, header sensivel ou URL assinada deve ser registrado.
- Este template autoriza planejamento, nao execucao automatica.
