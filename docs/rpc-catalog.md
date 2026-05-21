# KinoCampus — Catálogo de RPCs e Funções do Banco

## Convenções

- Funcoes e RPCs fixam explicitamente o `search_path`; RPCs legadas costumam usar `public`, enquanto helpers endurecidos a partir de `v9.2.3` usam `''` com referencias qualificadas — padrao que continua em toda a trilha v11

- Funções com prefixo `kc_` são funções públicas do KinoCampus
- `SECURITY DEFINER` + `SET search_path = public` — executa com permissões do owner, sem injeção de schema
- Triggers são prefixados com `kc_handle_` ou `kc_set_`
- RPCs chamados via `supabase.rpc('nome_funcao', params)`

---

## RPCs Públicas (chamadas via API)

### `kc_get_feed_cursor(p_module text, p_modules text[], p_category text, p_subcategory text, p_tag text, p_q text, p_sort_by text, p_limit int, p_cursor text, p_request_params jsonb default null) → JSONB` *(v9.2.2, estendido em v9.2.1.1, v9.2.1.2 e v9.2.1.3)*

Pagina o feed com cursor opaco, sem `OFFSET`, preservando a ordenação real de cada rail.

**Chamado em:** `KCAPI.getFeedCursor()`

**Retorno:** `{ "ok": true, "posts": [...], "next_cursor": "opaque-token-or-null", "has_more": true }`

**Ordenação por `p_sort_by`:**
- `recentes` → `bumped_at DESC NULLS LAST`, depois `created_at DESC`, `id DESC`
- `comentados` → `last_comment_at DESC`, depois `created_at DESC`, `id DESC`
- `votos` → `highlight_score DESC`, `votos DESC`, `created_at DESC`, `id DESC`

**Observações:**
- `p_module` cobre feed de módulo único; `p_modules` cobre feeds híbridos como `['compra-venda', 'livros']`.
- O cursor é token opaco em base64 com os campos mínimos de desempate; callers não montam esse valor manualmente.
- `p_request_params` aplica no banco os filtros avançados já existentes dos módulos de marketplace, caronas, moradia, oportunidades e achados-perdidos.
- A extensão de `v9.2.1.1` preserva a semântica de ordenação e cursor de `v9.2.2`; apenas amplia o envelope de filtros aceito pelo RPC.
- `v9.2.1.2` adiciona `priceMin` / `priceMax` no envelope cursor-based, filtrando por `posts.price` no banco e normalizando faixas invertidas antes da consulta.
- `v9.2.1.3` adiciona `datePreset` no mesmo envelope, com interpretação fixa em `America/Sao_Paulo` e semântica por módulo:
  - feeds de recência (`compra-venda`, `livros`, `moradia`, `oportunidades`, `achados-perdidos`) usam `created_at`
  - `caronas` usa `created_at` com janelas curtas (`today`, `last3d`, `last7d`)
  - `eventos` usa `metadata.data_evento` / `metadata.data` com fallback para `created_at`
- A versão atual da RPC também fixa `SET search_path = ''`, mantendo referências qualificadas aos objetos do app.

**Helpers relacionados (v9.2.1.3):**
- `kc_feed_local_date(p_value timestamptz) → date`
- `kc_feed_event_local_date(p_metadata jsonb, p_created_at timestamptz) → date`
- `kc_feed_matches_date_preset(p_module text, p_created_at timestamptz, p_metadata jsonb, p_preset text, p_now timestamptz default now()) → boolean`

---

### `kc_search_posts_fts(p_q text, p_terms text[], p_module text, p_category text, p_subcategory text, p_limit int) → SETOF JSONB` *(v9.2.0)*

Busca server-side dedicada para a página `search-results.html` e o dropdown global do header.

**Chamado em:** `KCAPI.searchPosts()`

**Cobertura de busca:**
- `title`
- `description`
- `category`
- `metadata->>'subcategoria'` / `metadata->>'subcategory'`
- `metadata->'tags'` (com compatibilidade para `tagKeys`)

**Ordenação:** `ts_rank_cd(...) DESC`, depois `created_at DESC`, `id DESC`

**Observações:**
- `p_terms` já chega expandido pelo client com sinônimos deduplicados.
- A função roda com `SET search_path = public` e respeita RLS por manter semântica de `SECURITY INVOKER`.
- O retorno já inclui `profiles`, `post_media` e `comments(count)` para compatibilidade com `normalizeSupabasePost`.

---

### `kc_admin_search_posts_full(p_query text, p_status text, p_limit int, p_offset int) → TABLE` *(v10.0.0.0)*

Busca administrativa de posts com cobertura além da página corrente do grid.

**Chamado em:** `admin-moderation.controller.js`

**Retorno:** linhas com:

- `id`
- `legacy_id`
- `title`
- `content`
- `status`
- `created_at`
- `updated_at`
- `author_id`
- `author_name`
- `module`
- `category`
- `total_count`

**Observações:**
- Implementada com `SECURITY DEFINER` e `SET search_path = ''`.
- Faz referências qualificadas a `public.posts` e `public.profiles`.
- Bloqueia caller não-admin com `FORBIDDEN`.
- Permite paginação real por `limit/offset`, mantendo `count(*) over()` para total.

---

### `kc_admin_list_help_requests_paged(p_status text, p_type text, p_limit int, p_offset int) → TABLE` *(v10.0.1.0)*

Pagina os tickets de ajuda do admin sobre a tabela canônica `public.help_requests`.

**Chamado em:** `KCAPI.listAdminHelpRequests()` / `admin-help-requests.controller.js`

**Retorno:** linhas com:

- `id`
- `user_id`
- `type`
- `topic`
- `subtopic`
- `subject`
- `message`
- `priority`
- `status`
- `page_path`
- `contact_email`
- `allow_contact`
- `metadata`
- `created_at`
- `updated_at`
- `author_name`
- `total_count`

**Observações:**
- Implementada com `SECURITY DEFINER` e `SET search_path = ''`.
- Bloqueia caller não-admin com `FORBIDDEN`.
- O frontend usa esse caminho preferencial quando não há filtro textual ou por prioridade; nos demais casos, mantém fallback controlado.

---

### `kc_get_user_rating_summary(p_target_user_id uuid) → JSONB` *(v9.1.2.0)*

Resumo público da reputação de um usuário.

**Chamado em:** `KCAPI.getUserRatingSummary()`

**Retorno:** `{ "userId": "uuid", "average": 4.5, "count": 12 }`

**Observações:**
- A função lê os agregados persistidos em `profiles.rating_avg` e `profiles.rating_count`.
- A função fixa `SET search_path = ''`.

---

### `kc_get_user_rating_state(p_target_user_id uuid, p_context_post_id uuid default null) → JSONB` *(v9.1.2.0)*

Resolve o estado do viewer autenticado para avaliar um usuário alvo.

**Chamado em:** `KCAPI.getUserRatingState()`

**Retorno:** `{ "targetUserId": "uuid", "contextPostId": "uuid-or-null", "canRate": true, "reason": "OK", "myRating": {...} }`

**Regras de elegibilidade:**
- Bloqueia autoavaliação (`SELF`).
- Exige autenticação (`AUTH_REQUIRED`).
- Exige contexto válido quando `p_context_post_id` é enviado (`INVALID_CONTEXT`).
- Libera avaliação apenas quando já existe interação persistida com posts do alvo via `comments`, `post_votes` ou `saved_posts`; do contrário retorna `NO_INTERACTION`.
- Se já existir avaliação do mesmo viewer para o alvo, o estado retorna `canRate = true` com `myRating` preenchido para permitir edição.

**Observações:**
- Implementada com `SECURITY DEFINER` e `SET search_path = ''`.

---

### `kc_list_user_ratings(p_target_user_id uuid, p_page integer default 1, p_limit integer default 10) → JSONB` *(v9.1.2.0)*

Lista textual paginada das avaliações públicas de um usuário.

**Chamado em:** `KCAPI.listUserRatings()`

**Retorno:** `{ "items": [...], "page": 1, "limit": 10, "total": 3, "hasMore": false }`

**Observações:**
- Quando o perfil alvo não é público e o caller não é o próprio alvo, a função retorna lista vazia.
- A identidade do avaliador é anonimizada como `Membro da comunidade` quando `profiles.profile_public = false`.
- Implementada com `SET search_path = ''`.

---

### `kc_upsert_user_rating(p_target_user_id uuid, p_context_post_id uuid default null, p_rating integer default null, p_comment text default null) → JSONB` *(v9.1.2.0)*

Cria ou atualiza a avaliação do viewer autenticado para um usuário alvo.

**Chamado em:** `KCAPI.upsertUserRating()`

**Retorno:** `{ "ok": true, "rating": {...}, "summary": {...} }`

**Validações:**
- `p_rating` deve estar entre `1` e `5`.
- `p_comment` é opcional e limitado a `280` caracteres.
- O par `(rater_user_id, target_user_id)` é único e o write usa `INSERT ... ON CONFLICT DO UPDATE`.
- A função reaproveita `kc_get_user_rating_state()` para aplicar as mesmas regras de elegibilidade.

**Observações:**
- Implementada com `SECURITY DEFINER` e `SET search_path = ''`.
- A atualização dos agregados do alvo é automática via trigger `kc_trigger_user_ratings_sync_target`.

---

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

### `kc_check_post_flood_limit(p_user_id uuid, p_module text) → JSONB`

Verifica se usuário pode criar novo post dentro da janela móvel de anti-spam.

**Chamado internamente em:** `kc_anti_spam_gate`, `supabase.posts-write.adapter.js` e `services/cadu-ufg-publisher/src/publisher.js`.

**Retorno:** `{ "ok": true, "count": 2, "limit": 10, "window_minutes": 60, "remaining": 8 }` ou `{ "ok": false, "count": 10, "limit": 10, "window_minutes": 60, "reset_at": "..." }`.

---

### `kc_admin_set_post_flood_limit(p_user_id uuid, p_module text, p_max_posts int, p_window_minutes int) → JSONB`

Configura, via admin, o limite de ritmo de criação de posts. `p_user_id=NULL` aplica globalmente; `p_module=NULL` aplica a todos os módulos.

**Chamado em:** `/admin/moderation.html`, painel "Limites de Publicações".

**Audit:** registra `post_flood_limit_changed` em `audit_log`.

---

### `kc_admin_get_post_flood_limits() → JSONB`

Lista overrides de ritmo de publicação para o painel admin.

---

### `kc_admin_delete_post_flood_limit(p_limit_id uuid) → JSONB`

Remove override de ritmo de publicação.

**Audit:** registra `post_flood_limit_deleted` em `audit_log`.

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

### `kc_prune_old_analytics() → JSONB` *(v9.0.4 + v9.3.1)*

Remove analytics antigos para evitar crescimento ilimitado.

```sql
DELETE FROM search_queries WHERE created_at < now() - interval '6 months';
DELETE FROM audit_log WHERE created_at < now() - interval '1 year';
DELETE FROM post_view_events WHERE created_at < now() - interval '6 months';  -- v9.3.1
```

**Chamado em:** pg_cron job mensal (dia 1 de cada mês, 04:00 UTC).

**Permissão:** Somente service_role (pg_cron). Não disponível para authenticated.

---

### `kc_track_view(p_post_id UUID) → JSONB` *(v9.3.1)*

Registra visualizacao de post com anti-spam (1 view/usuario/post/hora). Self-views nao contam. SECURITY DEFINER com `SET search_path = ''`.

**Retorno:** `{ ok, counted, code->, view_count-> }`
- `SELF_VIEW`: autor vendo proprio post (nao conta)
- `COOLDOWN`: usuario ja visualizou na ultima hora (nao conta)
- `counted: true`: view registrada com sucesso

### `kc_get_post_analytics(p_post_id UUID) → JSONB` *(v9.3.1)*

Retorna metricas completas de um post. Apenas autor ou admin. SECURITY DEFINER STABLE com `SET search_path = ''`.

**Retorno:** `{ ok, post_id, status, views, votos, comments, shares, coupon_clicks, saves, highlight_score, created_at }`

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

### `kc_get_notifications(p_limit int, p_offset int) → JSONB` *(v9.1.0)*

Lista paginada de notificações do usuário autenticado.

**Chamado em:** `KCAPI.getNotifications()`

**Retorno:**
```json
{ "ok": true, "notifications": [...], "total": 42, "unread": 5 }
```

---

### `kc_mark_notifications_read(p_ids uuid[]) → JSONB` *(v9.1.0)*

Marca notificações específicas como lidas.

**Chamado em:** `KCAPI.markNotificationsRead()`

**Retorno:** `{ "ok": true, "updated": 3 }`

---

### `kc_mark_all_notifications_read() → JSONB` *(v9.1.0)*

Marca todas as notificações do usuário como lidas.

**Chamado em:** `KCAPI.markAllNotificationsRead()`

**Retorno:** `{ "ok": true, "updated": 5 }`

---

### `kc_unread_notification_count() → BIGINT` *(v9.1.0)*

Retorna contagem de notificações não-lidas.

**Chamado em:** `KCAPI.getUnreadNotificationCount()`

---

### `kc_prune_old_notifications() → JSONB` *(v9.1.0)*

Remove notificações lidas com mais de 90 dias.

**Chamado em:** pg_cron mensal (dia 1, 05:00 UTC).

**Permissão:** Somente service_role (pg_cron).

---

## Convites Externos / Admin *(v9.1.0.3+)*

### `kc_is_invited_email(p_email text) -> boolean` *(v9.1.0.3)*

Verifica se um e-mail externo possui convite ativo e nao expirado.

**Chamado em:** fluxos de auth/invite no banco; atualmente nao ha caller JS direto catalogado.

---

### `kc_admin_add_invite(p_email text, p_note text) -> JSONB` *(v9.1.0.3)*

Registra ou renova convite manualmente no banco, sem disparar envio de e-mail.

**Chamado em:** uso administrativo via SQL/testes. O frontend atual prefere a Edge Function `kc-invite-user`.

**Retorno:** `{ "ok": true, "email": "usuario@externo.com" }`

---

### `kc_admin_get_invites() -> TABLE(...)` *(v9.1.0.3)*

Lista convites externos com status de expiracao para o painel admin.

**Chamado em:** `KCAPI.getInvites()`

**Retorno:** linhas com `email`, `invited_by`, `note`, `invited_at`, `used_at`, `expires_at`, `is_expired`.

---

### `kc_mark_invite_used() -> void` *(v9.1.0.3)*

Marca como usado o convite do proprio e-mail autenticado apos onboarding.

**Chamado em:** trilha de onboarding/convite no banco; atualmente nao ha caller JS direto catalogado.

---

### `kc_admin_revoke_invite(p_email text) -> JSONB` *(v9.1.0.3 / v9.1.0.4)*

Revoga convite externo e registra `invite_revoked` no `audit_log`.

**Chamado em:** `KCAPI.revokeInvite()`

**Retorno:** `{ "ok": true, "email": "usuario@externo.com" }`

---

## Triggers de Notificação *(v9.1.0)*

### `kc_notify_on_comment()` [Trigger em comments]

**Evento:** `AFTER INSERT ON comments`

**O que faz:** Insere notificação `comment_on_post` para o autor do post. Ignora auto-comentários.

---

### `kc_notify_on_vote()` [Trigger em post_votes]

**Evento:** `AFTER INSERT ON post_votes`

**O que faz:** Emite o evento `vote_on_post` para o autor do post quando recebe voto positivo. Ignora self-votes e votos `cold`.

**Nota v11.20.2:** o trigger foi realinhado ao contrato real de `post_votes`, usando `new.voter_id` e `direction = 'hot'`.

---

### `kc_emit_notification_event(p_user_id uuid, p_event_type text, p_title text, p_body text, p_data jsonb)` [Helper canônico de notificações] *(v11.20.2)*

**O que faz:** Centraliza a emissão de notificações. Quando `in_app` está habilitado, insere em `public.notifications`; em seguida, avalia os canais externos e cria/atualiza items em `notification_delivery_outbox` para `email` e `whatsapp`.

**Observações:**
- preserva `public.notifications` como feed canônico do sino/dropdown
- permite evento externo mesmo quando `in_app` estiver desligado
- não chama provider diretamente; apenas alimenta a fila assíncrona

---

### `kc_enqueue_notification_delivery(...)` [Helper de outbox] *(v11.20.2)*

**O que faz:** Resolve o destino privado do canal, monta o payload e cria/atualiza uma row em `notification_delivery_outbox`.

**Canais atuais:** `email`, `whatsapp`

**Comportamento atual:**
- `email`: usa `auth.users.email`
- `whatsapp`: usa `notification_channel_targets.destination` quando existir numero privado valido e consentimento explicito; do contrario segue `blocked`

---

### `kc_claim_notification_delivery_batch(p_channel text, p_limit int, p_worker text) → SETOF notification_delivery_outbox` [Helper de claim] *(v11.21.0)*

**O que faz:** seleciona um lote elegível do outbox com `FOR UPDATE SKIP LOCKED`, troca o status para `processing` e registra `locked_at` / `locked_by`.

**Observações:**
- recupera locks stale de rows que ficaram em `processing`
- hoje e usado pelo dispatcher dos canais `email` e `whatsapp`
- mantém o claim atômico fora da Edge Function para evitar corrida entre workers

---

### `kc_record_notification_delivery_attempt(...) → notification_delivery_outbox` [Helper de fechamento] *(v11.21.0)*

**O que faz:** registra uma row imutável em `notification_delivery_attempts` e atualiza o item correspondente em `notification_delivery_outbox`.

**Status aceitos:** `sent`, `failed`, `blocked`, `cancelled`, `skipped`

**Observações:**
- incrementa `attempts_count`
- limpa `locked_at` / `locked_by`
- preenche `last_attempt_at`, `sent_at`, `error_code`, `error_message` e `next_attempt_at` conforme o desfecho

---

### `kc_count_recent_notification_deliveries(p_user_id uuid, p_channel text, p_since timestamptz default now() - interval '60 minutes') -> integer` [Helper operacional] *(v11.21.1)*

**O que faz:** conta quantas entregas externas recentes ja foram marcadas como `sent` para um usuario e canal, servindo de base para o rate limit do dispatcher.

**Uso atual:** Edge Function `kc-dispatch-notification-outbox` no canal `whatsapp`.

---

### `kc_trigger_notification_dispatch(p_channel text, p_limit int, p_dry_run boolean, p_source text) -> bigint` [Helper operacional de scheduler] *(v11.22.0)*

**O que faz:** monta o body canônico do dispatcher externo e dispara um `net.http_post(...)` para a Edge Function `kc-dispatch-notification-outbox`.

**Comportamento atual:**
- lê `notification_dispatch_runtime.function_url`
- lê `notification_dispatch_runtime.dispatch_secret`
- lê `notification_dispatch_runtime.batch_limit`
- mantém `app.settings.kc_notification_dispatch_*` apenas como fallback operacional
- retorna `NULL` quando a configuração ainda não existe, preservando fail-closed

**Uso atual:**
- job `pg_cron` `kc-dispatch-notification-outbox`
- invocações operacionais manuais por `service_role`

---

### `kc_resolve_notification_delivery_destination(p_user_id uuid, p_channel text) -> TABLE(destination text, destination_source text, is_ready boolean, block_reason text)` [Helper de destino privado] *(v11.20.2, ampliada em v11.21.1)*

**O que faz:** resolve o destino privado do canal externo antes de alimentar a fila.

**Comportamento atual:**
- `email`: usa `auth.users.email`
- `whatsapp`: usa `notification_channel_targets.destination` somente quando houver numero privado valido e `consent_granted=true`

**Observa->->es:**
- o helper nunca reaproveita automaticamente o WhatsApp publico do perfil/produto
- a origem do destino para `whatsapp` passa a ser `private.notification_channel_targets.whatsapp`

---

### `kc_notify_on_post_expire(p_post_id, p_author_id, p_title, p_module)` [Função helper]

**Chamado por:** `kc_expire_old_posts()` quando expira um post.

**O que faz:** Insere notificação `post_expired` para o autor.

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

### `kc_unaccent(input_text text) → text` [IMMUTABLE]

Wrapper imutável para `unaccent`, usado na expressão indexada do FTS.

---

### `kc_posts_search_document(p_title text, p_description text, p_category text, p_metadata jsonb) → tsvector` [IMMUTABLE]

Documento ponderado do FTS:
- peso `A` → `title`
- peso `B` → `tags`
- peso `C` → `description`
- peso `D` → `category` e `subcategory`

**Chamado em:** índice `idx_posts_fts` e RPC `kc_search_posts_fts`.

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

### `kc_anti_spam_gate()` [Trigger em posts] *(v9.3.2)*

**Evento:** `BEFORE INSERT ON posts`

**O que faz:** Aplica 3 verificações anti-spam em cascata antes de criar um post:

1. **Flood control** — se o autor já tem 3+ posts na última hora: `RAISE EXCEPTION 'flood_limit_exceeded'` (hard block). Frontend mapeia para `{ _kcError: 'FLOOD_LIMIT' }`.
2. **Link spam** — se title+description têm >3 URLs externas (regex `https->://`): muta `NEW.status = 'pending'` e `moderation_reason = 'link_spam'`.
3. **New user trust** — se conta foi criada há <7 dias E 0 posts com status `published`: muta `NEW.status = 'pending'` e `moderation_reason = 'new_user_scrutiny'` (só se link_spam não definiu razão).

Posts auto-moderados (status=`pending`) ficam invisíveis nos feeds para não-autores (via RLS). O autor vê seu próprio post com badge informativo. Admin pode aprovar via `kc_admin_set_post_status`.

**Segurança:** `SECURITY DEFINER` + `SET search_path = ''`. REVOKE de `anon` e `authenticated` (chamada apenas pelo trigger).

**Coluna nova:** `posts.moderation_reason TEXT` — registra a razão, NULL para posts normais.

---

## Índices Relevantes para Performance

```sql
-- Posts (queries mais frequentes)
idx_posts_author_created   ON posts(author_id, created_at DESC)
idx_posts_module_created   ON posts(module, created_at DESC)
idx_posts_category_created ON posts(category, created_at DESC)

-- Comments
idx_comments_post_created  ON comments(post_id, created_at)
idx_comments_parent_id     ON comments(parent_id)  -- v9.1.1

-- Voting
post_votes_post_id_idx         ON post_votes(post_id)
post_votes_post_id_voter_id_key ON post_votes(post_id, voter_id)
post_votes_voter_id_idx        ON post_votes(voter_id)

-- Analytics
idx_search_queries_term    ON search_queries(term)
idx_search_queries_user    ON search_queries(user_id, created_at)  -- v9.0.4

-- Notificações (v9.1.0)
idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false
idx_kc_invited_emails_invited_by ON kc_invited_emails(invited_by)  -- v9.3.3
idx_post_view_events_user_id ON post_view_events(user_id)          -- v9.3.3

-- Full-text search (v9.2.0)
idx_posts_fts ON posts USING GIN(kc_posts_search_document(title, description, category, metadata)) WHERE legacy_id IS NULL

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
