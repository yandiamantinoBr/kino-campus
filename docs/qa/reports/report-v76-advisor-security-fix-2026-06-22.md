# Report de QA V76.53 — Fix Advisor Security Warnings (2026-06-22)

**Data:** 2026-06-22
**Escopo:** Resolver 3 avisos `WARN` do Supabase Advisor reportados no projeto `Kino Campus` (`wacyrkwhkvzwkqpolrbg`)
**Modo:** read-only em producao; apenas migrations SQL e PATCH em config auth
**Resultado:** 2 dos 3 avisos resolvidos. 1 aviso requer upgrade do plano Free para Pro+ (decisao humana)

---

## Avisos reportados (estado inicial)

| # | Aviso | Severidade | Facing |
|---|---|---|---|
| 1 | `anon_security_definer_function_executable` (kc_chat_mark_messages_read) | WARN | EXTERNAL |
| 2 | `authenticated_security_definer_function_executable` (kc_chat_mark_messages_read) | WARN | EXTERNAL |
| 3 | `auth_leaked_password_protection` | WARN | EXTERNAL |

---

## Investigacao

### Funcao `public.kc_chat_mark_messages_read()`

Definicao original (extraida via `pg_get_functiondef()`):

```sql
CREATE OR REPLACE FUNCTION public.kc_chat_mark_messages_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  update public.chat_messages
    set read_at = greatest(coalesce(read_at, now()), coalesce(new.last_read_at, now()))
    where conversation_id = new.conversation_id
      and sender_id <> new.user_id
      and read_at is null;
  return new;
end;
$function$
```

ACL original (verificada em `information_schema.role_routine_grants`):

```
grantee       | privilege_type
PUBLIC        | EXECUTE
anon          | EXECUTE
authenticated | EXECUTE
service_role  | EXECUTE
postgres      | EXECUTE
```

Trigger que usa a funcao:

```sql
CREATE TRIGGER trg_chat_mark_messages_read
  AFTER INSERT OR UPDATE OF last_read_msg_id, last_read_at
  ON public.chat_read_state FOR EACH ROW
  EXECUTE FUNCTION kc_chat_mark_messages_read();
```

Proprietario da funcao e da tabela: `postgres`.

### Causa raiz

A funcao e `SECURITY DEFINER` deliberadamente (precisa de privilegios elevados para atualizar `chat_messages` em nome do usuario que disparou o trigger). Porem, alem do trigger interno, ela estava EXPOSTA via `/rest/v1/rpc/kc_chat_mark_messages_read` para `anon`, `authenticated` e PUBLIC. Isso permite que usuarios nao autenticados ou com qualquer role chamem a funcao arbitrariamente, sem que o frontend precise dela (verificado: `grep -r kc_chat_mark_messages_read assets/` retornou zero referencias no codigo JS).

### Por que revogar EXECUTE e seguro

O trigger `trg_chat_mark_messages_read` e executado **internamente pelo Postgres** quando ha INSERT ou UPDATE na tabela `chat_read_state`. O usuario que faz a operacao na tabela nao precisa de EXECUTE na funcao trigger para que o trigger seja disparado — a funcao roda com os privilegios do owner (`postgres`), nao do usuario. Outras funcoes SECURITY DEFINER no schema (`kc_anti_spam_gate`, `kc_expire_old_posts`, etc.) ja seguem esse padrao: `{postgres=X/postgres, service_role=X/postgres}`.

---

## Fix aplicada (2026-06-22 23:05 UTC via Management API)

Migration: `supabase/migrations/20260622210709_fix_advisor_security_warnings.sql`

```sql
REVOKE EXECUTE ON FUNCTION public.kc_chat_mark_messages_read() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kc_chat_mark_messages_read() FROM anon;
REVOKE EXECUTE ON FUNCTION public.kc_chat_mark_messages_read() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kc_chat_mark_messages_read() TO postgres;
GRANT EXECUTE ON FUNCTION public.kc_chat_mark_messages_read() TO service_role;
```

Migration registrada em `supabase_migrations.schema_migrations` com `version=20260622210709`.

### Verificacao pos-fix

```
check_name                                            | result
kc_chat_mark_messages_read grants                     | OK - sem grants para anon/authenticated
Trigger trg_chat_mark_messages_read ainda ativo       | OK - trigger ativo
Funcao ainda SECURITY DEFINER                         | OK - SECURITY DEFINER (necessario para o trigger)
```

Nova ACL:

```
name                       | acl                                                | security_definer
kc_chat_mark_messages_read | {postgres=X/postgres, service_role=X/postgres}    | true
```

---

## Aviso nao resolvido: `auth_leaked_password_protection`

### Tentativa de fix via Management API

```http
PATCH /v1/projects/wacyrkwhkvzwkqpolrbg/config/auth
Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}
Content-Type: application/json

{"password_hibp_enabled": true}
```

Resposta: **HTTP 402 Payment Required**.

### Causa

O projeto esta no **plano Free** (`GET /v1/organizations/mylpdrlxzujksiuhkqpolrbx` → `"plan": "free"`). A feature HIBP (HaveIBeenPwned) password protection esta disponivel apenas em **planos Pro+**.

### Acoes alternativas enquanto isso

1. Manter `password_min_length=6` + complexidade atual ja configurados
2. Considerar aumentar `password_min_length` para 8 (testar se Free aceita via PATCH na config)
3. Avaliar custo/beneficio de upgrade do plano so por este item
4. Validacao client-side de senhas comuns no signup (lista de senhas triviais em `assets/js/auth/`)

### Acao humana pendente

Decidir upgrade do plano Pro (~$25/mes) ou aceitar o risco residual deste aviso. Documentar em `docs/ops/v19-operational-runbook.md` apos decisao.

---

## Estado final do Advisor

| Aviso | Status |
|---|---|
| `anon_security_definer_function_executable_public_kc_chat_mark_messages_read_` | **RESOLVIDO** |
| `authenticated_security_definer_function_executable_public_kc_chat_mark_messages_read_` | **RESOLVIDO** |
| `auth_leaked_password_protection` | **PENDENTE** (plano Free limita) |

Nota: este report NAO tem probe automatica do Advisor API porque `/v1/projects/{ref}/advisors/lints` nao existe no Management API. A verificacao foi feita indiretamente: nova ACL aplicada via SQL + trigger verificado via `pg_trigger`. O Advisor do Supabase dashboard faz a varredura diaria; a verificacao automatica da resolucao dos lints ocorrera na proxima execucao.

---

## Validacoes

- `npm run check:version` OK
- `npm run check:structure` OK (169 itens)
- `npm run check:all` 5/5 OK
- `npm test` 195 suites / 3806 testes verde (sem regressao)
- Trigger verificado ativo (`pg_trigger.tgenabled = 'O'`)
- ACL verificada com grants reduzidos para `postgres` + `service_role` apenas

## Referencias

- `supabase/migrations/20260622210709_fix_advisor_security_warnings.sql` (migration aplicada)
- `supabase_migrations.schema_migrations` (registrada como `20260622210709 fix_advisor_security_warnings`)
- ADENDO V2 §8.9 (item M1 original: "decisao humana fora do escopo automatico")
- RELATORIO V1 B7 (mesmo item, mesmo status)
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection