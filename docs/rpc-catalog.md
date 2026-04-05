# KinoCampus — Catálogo de RPCs e Funções do Banco

## Convenções

- Funções com prefixo `kc_` são funções públicas do KinoCampus
- `SECURITY DEFINER` + `SET search_path = public` — executa com permissões do owner, sem injeção de schema
- Triggers são prefixados com `kc_handle_` ou `kc_set_`
- RPCs chamados via `supabase.rpc('nome_funcao', params)`

---

## RPCs Públicas (chamadas via API)

### `kc_bump_post(p_post_id uuid) → JSONB`

Sobe o post para o topo do feed. Cooldown de 1 dia.

**Chamado em:** `KCAPI.bumpPost()`

**Validações:**
- Post deve existir e estar `status = 'published'`
- Autor deve ser o usuário logado
- Último bump deve ter sido há mais de 1 dia

**Retorno:**
```json
{ "ok": true, "bumped_at": "ISO8601", "next_bump_at": "ISO8601", "cooldown_days": 1 }
```

**Erro:** `{ "ok": false, "error": "POST_BUMP_COOLDOWN_ACTIVE", "next_bump_at": "..." }`

---

### `kc_renew_post(p_post_id uuid) → JSONB`

Reativa post expirado ou oculto. Redefine `expires_at`.

**Chamado em:** `KCAPI.renewPost()`

**Lógica:** `expires_at = now() + 7 dias` (caronas) ou `+ 30 dias` (outros módulos)

**Valida:** post limit via `kc_check_post_limit` antes de renovar.

**Retorno:** `{ "ok": true, "expires_at": "ISO8601", "status": "published" }`

---

### `kc_toggle_post_status(p_post_id uuid) → JSONB`

Alterna `published ↔ hidden`.

**Chamado em:** `KCAPI.togglePostStatus()`

**Retorno:** `{ "ok": true, "status": "hidden" | "published" }`

---

### `kc_expire_old_posts() → void`

Marca como `expired` todos os posts publicados com `expires_at ≤ now()`.

**Chamado em:** pg_cron job diário às 03:00.

**Não afeta:** posts deletados, hidden, pending.

---

### `kc_check_post_limit(p_user_id uuid, p_module text) → JSONB`

Verifica se usuário pode criar/renovar post no módulo.

**Chamado internamente em:** `kc_renew_post`, `kc_toggle_post_status`, `supabase.adapter.js` no create.

**Retorno:** `{ "ok": true, "count": 2, "limit": 5 }` ou `{ "ok": false, "error": "POST_LIMIT_REACHED", "count": 5, "limit": 5 }`

---

### `kc_get_top_contributors(p_period text, p_module text, p_limit int) → JSONB`

Ranking dos usuários mais ativos.

**Chamado em:** `KCAPI.getTopContributors()`

**Scoring (por usuário, deduplicado por post):**

| Ação | Pontos |
|------|--------|
| Post criado | +15 |
| Voto positivo recebido | +10 |
| Comentário escrito | +5 |
| CTA do post acessado | +4 |
| Post compartilhado | +3 |
| Denúncia confirmada (penalidade) | -50 |

**Anti-spam:** SQL agrega `GROUP BY (user_id, post_id)` — múltiplas ações no mesmo post contam uma vez.

**Retorno:** Array JSON `[{ user_id, display_name, avatar_url, score, rank, breakdown: {...} }]`

---

### `kc_set_post_expires_at(p_post_id uuid, p_days int) → void`

Define `expires_at` em um post. Chamado como trigger ao criar post.

**Lógica:** `module = 'caronas'` → 7 dias; outros → 30 dias.

---

### `kc_get_profile_highlights(p_user_id uuid, p_limit int) → TABLE`

Posts com maior `highlight_score` de um usuário.

**Chamado em:** `KCAPI.getProfileHighlights()`

**Critério:** `highlight_score > threshold` (definido internamente, ~50).

---

### `kc_insert_search_query(p_term text, p_session_id text, p_user_id uuid) → void`

Registra busca para analytics.

**Chamado em:** `kc-search.js` em cada busca realizada.

---

### `kc_prune_old_analytics() → JSONB` *(v9.0.4)*

Remove analytics antigos para evitar crescimento ilimitado.

```sql
DELETE FROM search_queries WHERE created_at < now() - interval '6 months';
DELETE FROM audit_log WHERE created_at < now() - interval '1 year';
```

**Chamado em:** pg_cron job mensal (dia 1 de cada mês, 04:00 UTC).

**Permissão:** Somente service_role (pg_cron). Não disponível para authenticated.

**Retorno:** `{ "ok": true, "search_queries_deleted": N, "audit_log_deleted": N }`

**Audit:** Registra a operação de limpeza no próprio audit_log após execução.

---

### `kc_admin_legacy_id_stats() → JSONB` *(v9.0.4)*

Retorna métricas de uso da coluna `posts.legacy_id` (deprecated) para embasar decisão de remoção futura.

**Chamado em:** Admin dashboard (manual).

**Permissão:** Somente admin (`kc_is_admin(auth.uid())`).

**Retorno:**
```json
{
  "ok": true,
  "total_posts": 150,
  "with_legacy_id": 42,
  "without_legacy_id": 108,
  "pct_legacy": 28.0,
  "oldest_legacy_post": "2024-...",
  "newest_legacy_post": "2025-...",
  "by_module": { "compra-venda": 20, "caronas": 12, ... },
  "safe_to_remove": false
}
```

**Quando `safe_to_remove = true`:** Nenhum post tem `legacy_id`. A coluna pode ser removida com segurança.

---

## Funções de Suporte / Helpers

### `kc_is_admin(p_user_id uuid) → boolean` [STABLE]

Verifica se usuário é admin.

**Chamado em:** todas as políticas RLS que precisam de verificação de admin.

**Padrão anti-timing:** `(SELECT kc_is_admin(auth.uid()))` em vez de `kc_is_admin(auth.uid())` direto (evita re-avaliação por row).

---

### `kc_profile_initial_display_name(p_user record) → text` [IMMUTABLE]

Deriva `display_name` dos metadados do usuário ao criar conta.

**Fallback:** primeiro trecho do email antes do `@`.

---

### `kc_profile_initial_avatar_url(p_user record) → text` [IMMUTABLE]

Extrai URL do avatar dos metadados do usuário ao criar conta.

**Fallback:** string vazia (app renderiza avatar padrão SVG).

---

## Triggers

### `kc_handle_new_user()` [Trigger em auth.users]

**Evento:** `AFTER INSERT ON auth.users`

**O que faz:** Cria automaticamente uma row em `profiles` com dados do novo usuário.

**Campos populados:** `id`, `display_name`, `full_name`, `avatar_url`, `email`.

---

### `kc_set_updated_at()` [Trigger genérico]

**Evento:** `BEFORE UPDATE` em várias tabelas

**O que faz:** Define `updated_at = now()` automaticamente.

**Aplicado em:** `profiles`, `posts`, `comments`, `reports`, `help_requests`, `post_limits`.

---

### `kc_set_post_expires_at_trigger()` [Trigger em posts]

**Evento:** `AFTER INSERT ON posts`

**O que faz:** Chama `kc_set_post_expires_at()` para definir `expires_at` baseado no módulo.

---

## Índices Relevantes para Performance

```sql
-- Posts (queries mais frequentes)
idx_posts_author_created   ON posts(author_id, created_at DESC)
idx_posts_module_created   ON posts(module, created_at DESC)
idx_posts_category_created ON posts(category, created_at DESC)

-- Comments
idx_comments_post_created  ON comments(post_id, created_at)
idx_comments_parent        ON comments(parent_id)  -- v9.1.1

-- Voting
idx_post_votes_user_post   ON post_votes(user_id, post_id)

-- Analytics
idx_search_queries_term    ON search_queries(term)
idx_search_queries_user    ON search_queries(user_id, created_at)  -- v9.0.4

-- Notificações (v9.1.0)
idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false

-- Full-text search (v9.2.0)
idx_posts_fts ON posts USING GIN(to_tsvector('portuguese', title || ' ' || description))

-- GIN em metadata (já existe)
posts_metadata_gin_idx ON posts USING GIN(metadata)
```

---

## Padrão de Segurança para Novas Funções

Toda nova função com `SECURITY DEFINER` **deve** ter:

```sql
CREATE OR REPLACE FUNCTION kc_nova_funcao(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- OBRIGATÓRIO: previne search_path injection
AS $$
BEGIN
  -- Sempre verificar auth.uid() antes de qualquer mutação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;
  -- ...
END;
$$;
```
