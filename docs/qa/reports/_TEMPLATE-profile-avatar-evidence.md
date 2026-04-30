# Evidencia Profile Avatar - TEMPLATE

**Candidato:** `PROFILE-AV-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/producao/redigido>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Usuario autenticado autorizado | `<sim/nao/redigido>` |
| Bucket `kino-media` validado | `<sim/nao/bloqueado>` |
| Caminho `profile-avatars/` validado | `<sim/nao/bloqueado>` |
| Policies storage revisadas | `<sim/nao/bloqueado>` |
| Secrets/redacoes conferidos | `<sim/nao>` |

---

## 2. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Perfil inicial carregado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Avatar selecionado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Upload storage concluido | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| `profiles.avatar_url/avatar_path` atualizado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Reload mostra avatar correto | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 3. Diagnostico

- Erro observado:
- Console/log redigido:
- Storage path redigido:
- Policy/RLS envolvida:
- Hipotese:
- Filescope sugerido:

---

## 4. Gates Relacionados

| Gate | Estado |
|---|---|
| Gate V37 | `<preenchido/pendente>` |
| Rollback V38 | `<preenchido/pendente>` |
| Candidato V39 | `<confirmado/pendente>` |
| Supabase Advisor V29 | `<validado/pendente>` |
| Smoke storage/RLS | `<pendente/concluido>` |

---

## 5. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 6. Redacao Obrigatoria

- Nao registrar signed URLs completas, tokens, ids pessoais ou caminho privado bruto.
- Mascarar email, user id e storage path quando nao forem necessarios.
- Se uma policy precisar mudar, anexar rollback R3 antes de qualquer patch.
