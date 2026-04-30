# Evidencia Search FTS - TEMPLATE

**Candidato:** `SEARCH-FTS-01`
**Versao planejada:** `<vXX.Y.Z>`
**Data:** `YYYY-MM-DD`
**Responsavel:** `<nome/redigido>`
**Ambiente:** `<banco isolado/preview/redigido>`

---

## 1. Pre-Requisitos

| Item | Estado |
|---|---|
| Banco isolado criado | `<sim/nao/bloqueado>` |
| 83 migrations aplicadas | `<sim/nao/bloqueado>` |
| Dataset controlado disponivel | `<sim/nao/redigido>` |
| Queries baseline salvas/redigidas | `<sim/nao>` |
| Rollback R3 preparado | `<sim/nao>` |

---

## 2. Inventario SQL

| Objeto | Estado atual | Evidencia |
|---|---|---|
| `pg_extension.unaccent` | `<schema/redigido>` | `<caminho/redigido>` |
| `public.kc_unaccent(text)` | `<presente/ausente>` | `<caminho/redigido>` |
| `public.kc_posts_search_document(...)` | `<presente/ausente>` | `<caminho/redigido>` |
| `idx_posts_fts` | `<presente/ausente/usado>` | `<caminho/redigido>` |
| `public.kc_search_posts_fts(...)` | `<presente/ausente>` | `<caminho/redigido>` |

---

## 3. Fluxo Testado

| Passo | Resultado | Evidencia |
|---|---|---|
| `kc_unaccent('Goias')` comparado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Busca com acento/sem acento | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| `kc_search_posts_fts` retornou ranking comparavel | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Feed com filtro textual preservou normalizacao | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Indice GIN validado antes/depois | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |
| Rollback testado | `<Passou/Falhou/Bloqueado>` | `<caminho/redigido>` |

---

## 4. Diagnostico

- Erro observado:
- Query/log redigido:
- Objeto SQL envolvido:
- Diferenca antes/depois:
- Hipotese:
- Filescope sugerido:

---

## 5. Gates Relacionados

| Gate | Estado |
|---|---|
| Auditoria V28 | `<revisada/pendente>` |
| Gate V37 | `<preenchido/pendente>` |
| Rollback V38 R3 | `<preenchido/pendente>` |
| Candidato V39 | `<confirmado/pendente>` |
| SQL smoke isolado | `<executado/bloqueado/pendente>` |

---

## 6. Decisao

| Decisao | Motivo |
|---|---|
| `<Go SQL isolado/No-Go/Bloqueado>` | `<justificativa>` |

---

## 7. Redacao Obrigatoria

- Nao registrar connection strings, project ids privados, dumps, linhas com dados pessoais ou tokens.
- Mascarar ids de posts, autores e termos sensiveis quando nao forem necessarios.
- Nao usar evidencia de producao como substituto para banco isolado.
- Se migration for necessaria, anexar rollback R3 antes de qualquer patch.
