# Evidencia Admin Moderacao - TEMPLATE

**Candidato:** `ADMIN-MOD-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<local/preview/producao/redigido>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Usuario admin autorizado | `<sim/nao/redigido>` |
| Usuario nao-admin para controle negativo | `<sim/nao/redigido>` |
| Conteudo/report de teste disponivel | `<sim/nao/bloqueado>` |
| Permissoes/RPC/policies revisadas | `<sim/nao/bloqueado>` |
| Secrets/redacoes conferidos | `<sim/nao>` |

---

## 2. Fluxo Admin Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| Login admin concluido | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| `admin/moderation.html` carregou | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Lista/metricas de moderacao renderizaram | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Acao administrativa testada em dado seguro | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Estado persistido apos reload | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 3. Controle Negativo

| Passo | Resultado | Evidencia |
|---|---|---|
| Login nao-admin concluido | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Acesso a `admin/moderation.html` bloqueado/redirecionado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Chamada administrativa direta falhou com permissao correta | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 4. Diagnostico

- Erro observado:
- Console/log redigido:
- Role/permissao envolvida:
- RPC/policy envolvida:
- Hipotese:
- Filescope sugerido:

---

## 5. Gates Relacionados

| Gate | Estado |
|---|---|
| Gate V37 | `<preenchido/pendente>` |
| Rollback V38 | `<preenchido/pendente>` |
| Candidato V39 | `<confirmado/pendente>` |
| Playwright admin/moderation | `<executado/bloqueado/pendente>` |
| Smoke RLS/RPC | `<pendente/concluido/dispensado>` |

---

## 6. Decisao

| Decisao | Motivo |
|---|---|
| `<Go/No-Go/Bloqueado>` | `<justificativa>` |

---

## 7. Redacao Obrigatoria

- Nao registrar emails completos, user ids, tokens, URLs assinadas, payloads privados ou dados de denuncia.
- Mascarar conteudo reportado quando nao for necessario para reproduzir a falha.
- Se role, RPC, policy ou migration precisarem mudar, anexar rollback R3 antes de qualquer patch.
