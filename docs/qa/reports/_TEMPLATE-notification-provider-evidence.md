# Evidencia Notification Provider - TEMPLATE

**Candidato:** `NOTIF-SB-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<sandbox/preview/local/redigido>`
**Canal:** `<email/whatsapp/ambos>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Ambiente nao-producao confirmado | `<sim/nao/bloqueado>` |
| Provider sandbox identificado | `<sim/nao/redigido>` |
| Secrets presentes sem expor valores | `<sim/nao/bloqueado>` |
| Destino de teste controlado | `<sim/nao/redigido>` |
| Opt-in documentado quando WhatsApp | `<sim/nao/nao-aplicavel>` |
| Rollback V38 preparado | `<sim/nao>` |

---

## 2. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Configuracao sandbox reconhecida | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Dry-run executado ou bloqueio registrado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Dispatch manual batch 1 executado | `<Passou/Falhou/Bloqueado/Dispensado>` | `<caminho/redigido>` |
| `notification_delivery_attempts` validado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| `notification_dispatch_runs` validado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Fail-closed sem provider validado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 3. Diagnostico

- Canal:
- Provider redigido:
- Erro observado:
- Console/log redigido:
- Attempt/run id redigido:
- Hipotese:
- Filescope sugerido:

---

## 4. Gates Relacionados

| Gate | Estado |
|---|---|
| Checklist V30 | `<preenchido/pendente>` |
| Gate V37 | `<preenchido/pendente>` |
| Rollback V38 | `<preenchido/pendente>` |
| Candidato V39 | `<confirmado/pendente>` |
| Suites de notificacao | `<executado/bloqueado/pendente>` |

---

## 5. Decisao

| Decisao | Motivo |
|---|---|
| `<Go sandbox/No-Go/Bloqueado>` | `<justificativa>` |

---

## 6. Redacao Obrigatoria

- Nao registrar service role key, API key, token WhatsApp, account id bruto, endpoint privado ou telefone completo.
- Mascarar email, telefone, user id, dispatch id e payload quando nao forem necessarios.
- Nao documentar envio real para usuario sem opt-in e aprovacao explicita.
- Se edge function, scheduler, policy ou migration precisarem mudar, anexar rollback R2/R3 antes de qualquer patch.
