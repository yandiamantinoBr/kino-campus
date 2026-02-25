# Relatório de execução — migration `v8.1.7.2_comments_table.sql`

Data: 2026-02-25  
Repositório: `kino-campus`

## Escopo solicitado
1. Executar `supabase/migrations/v8.1.7.2_comments_table.sql` no Supabase SQL Editor.
2. Confirmar criação de tabela/policies/função.
3. Validar grants de leitura pública (`anon`/`authenticated`).
4. Revisar aplicação em ordem das migrations posteriores.
5. Recarregar páginas de módulo e confirmar retorno de posts.

## Status geral
**BLOQUEADO PARCIALMENTE** por ausência de acesso operacional ao Supabase (CLI/credenciais/projeto). Foi possível apenas validação estática do SQL no repositório e checks locais de arquivos.

## Evidências técnicas

### 1) Execução no Supabase SQL Editor
- **Não executado** neste ambiente: não há Supabase CLI instalada e não há credenciais/projeto vinculados para acesso remoto.
- Comando executado:
  - `supabase --version` → `command not found`

### 2) Confirmação de objetos (validação estática do arquivo SQL)
No arquivo `supabase/migrations/v8.1.7.2_comments_table.sql`, foram identificados:
- criação da tabela `public.comments`;
- criação das policies:
  - `comments_select_public`
  - `comments_insert_auth`
  - `comments_update_own`
  - `comments_delete_own`
- criação da função `public.increment_comment_likes(uuid)`.

### 3) Grants de leitura pública
No mesmo arquivo, identificado:
- `grant select on table public.comments to anon, authenticated;`

### 4) Migrations posteriores e ordem
Arquivos posteriores à `v8.1.7.2` presentes na pasta `supabase/migrations/`:
- `v8.1.7.3_post_votes_table.sql`
- `v8.1.7.4_admin_setup.sql`
- `v8.1.7.5_auth_egresso_domain.sql`
- `v8.1.9.1_admin_posts_select.sql`
- `v8.1.10.0_profile_mvp_display_name.sql`
- `v8.1.11.0_audit_log.sql`
- `v8.1.11.1_admin_reports_threshold_notify.sql`
- `v8.2.3.0_fix_votes.sql`
- `v8.2.4.1_posts_delete_policy.sql`

> Observação: em shell, `supabase/migrations/*.sql` em ordem lexicográfica pode colocar `v8.1.10.x` antes de `v8.1.7.x`. Para aplicação manual, manter ordem de versão semântica/roteiro documentado no `README.md`.

### 5) Recarregamento das páginas de módulo
Tentativa de validação via browser automation foi **inconclusiva** por limitação de conectividade entre o navegador do tool e o servidor local nesta sessão (retorno `Not Found` no contexto do browser tool), apesar de `curl` local retornar `HTTP 200` para as páginas.

## Próximos passos recomendados (para fechar 100% do checklist)
1. Executar `v8.1.7.2_comments_table.sql` diretamente no SQL Editor do projeto alvo.
2. Rodar checks no SQL Editor:
   - `select to_regclass('public.comments');`
   - query em `pg_policies` filtrando os 4 nomes de policies.
   - `select proname from pg_proc where proname = 'increment_comment_likes';`
   - `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='comments';`
3. Se bootstrap manual: aplicar migrations posteriores em ordem semântica.
4. Validar feed nas páginas em ambiente com `KC_ENV.driver = 'supabase'` apontando ao projeto atualizado.
