# Report V75 - Supabase `unaccent` Extension Schema

**Data:** 2026-06-12 America/Sao_Paulo
**Escopo:** verificacao read-only do residual `extension_in_public` para `unaccent`
**Mudanca remota:** nao
**Dados sensiveis:** nenhum `project_ref`, token, connection string ou dado de usuario registrado

---

## 1. Objetivo

Fechar o pendente P1 da Auditoria V3 que exigia confirmar, no projeto Supabase remoto, o schema real
da extensao `unaccent`.

---

## 2. Metodo

Ferramentas usadas:

- Supabase CLI `2.105.0` apenas para descoberta de comandos e confirmacao de projeto ativo.
- Supabase MCP read-only:
  - `list_extensions`
  - `execute_sql`
  - `get_advisors(type = security)`

Consulta executada:

```sql
select e.extname, n.nspname as schema_name, e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname = 'unaccent';
```

A query acessa somente catalogos Postgres (`pg_extension`, `pg_namespace`) e nao retorna dados de
aplicacao.

---

## 3. Resultado

| Item | Resultado |
|---|---|
| `unaccent` instalado | Sim |
| Schema | `extensions` |
| Versao | `1.1` |
| `extension_in_public` ativo para `unaccent` | Nao observado |
| Advisor security | Apenas `auth_leaked_password_protection` retornou como WARN |

---

## 4. Conclusao

O residual `extension_in_public` para `unaccent` nao esta ativo no estado remoto verificado em
2026-06-12. Nao ha motivo para migration, SQL Editor ou alteracao de extensao nesta etapa.

A auditoria V28 continua util como referencia de impacto caso o Advisor volte a apontar esse item
ou caso seja necessario mexer na trilha FTS/search no futuro. O contrato `public.kc_unaccent` e os
indices/RPCs dependentes nao foram alterados.

---

## 5. Fora de Escopo

- Nenhum SQL de escrita.
- Nenhuma migration.
- Nenhuma alteracao em Supabase Dashboard.
- Nenhum dump, connection string ou dado real de tabela.
- Nenhum teste funcional de busca/feed.
