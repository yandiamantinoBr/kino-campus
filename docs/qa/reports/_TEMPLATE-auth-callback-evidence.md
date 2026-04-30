# Evidencia Auth Callback - TEMPLATE

**Candidato:** `AUTH-CB-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/producao/redigido>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Email institucional autorizado | `<sim/nao/redigido>` |
| Supabase Auth callback configurado | `<sim/nao/bloqueado>` |
| URL base validada | `<sim/nao/bloqueado>` |
| Secrets redigidos | `<sim/nao>` |

---

## 2. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Signup iniciado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Email recebido | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Callback aberto | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Sessao autenticada | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Perfil inicial carregado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 3. Diagnostico

- Erro observado:
- Console/log redigido:
- Request/response redigido:
- Hipotese:
- Filescope sugerido:

---

## 4. Gates Relacionados

| Gate | Estado |
|---|---|
| Gate V37 | `<preenchido/pendente>` |
| Rollback V38 | `<preenchido/pendente>` |
| Candidato V39 | `<confirmado/pendente>` |
| Playwright V32 | `<obrigatorio/recomendado/nao aplicavel>` |
| Smoke manual | `<pendente/concluido>` |

---

## 5. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 6. Redacao Obrigatoria

- Remover tokens, magic links completos, headers sensiveis e emails pessoais.
- Mascarar ids de usuario quando nao forem necessarios para depuracao.
- Nao anexar screenshot com URL assinada ou token visivel.
