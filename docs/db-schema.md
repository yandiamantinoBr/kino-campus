# KinoCampus — Schema do Banco de Dados

**Banco:** PostgreSQL (Supabase) | **Migrações aplicadas:** 63 (até v9.1.0.2)

> Atualizacao local de 06/04/2026: o repositorio ja contem 71 migrations ate `v9.1.2.0_user_ratings_foundation.sql`.

## Tabelas Principais

### `profiles` — Perfis de Usuário

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | FK para `auth.users.id` |
| `display_name` | TEXT | Nome público (derivado de full_name se não definido) |
| `full_name` | TEXT | Nome completo |
| `avatar_url` | TEXT | URL do avatar (pode ser URL externa ou Storage) |
| `avatar_path` | TEXT | Caminho no Storage `kino-media/profile-avatars/` |
| `bio` | TEXT | Biografia (max 500 chars) |
| `verified` | BOOLEAN | Conta verificada pelo admin |
| `is_admin` | BOOLEAN | Permissões de admin |
| `profile_public` | BOOLEAN | Perfil visível publicamente |
| `contact_primary_method` | TEXT | `'email'` ou `'whatsapp'` |
| `contact_cta_enabled` | BOOLEAN | Mostra botão de contato no produto |
| `social_links` | JSONB | `{ instagram, linkedin, twitter, github, website }` |
| `social_visibility` | JSONB | `{ instagram: 'public'/'private', ... }` |
| `affiliation` | TEXT | Curso/departamento na UFG |
| `gender_identity` | TEXT | Identidade de gênero |
| `gender_identity_custom` | TEXT | Personalizado se `gender_identity = 'outro'` |
| `race_color` | TEXT | Raça/cor autodeclarada |
| `rating_avg` | NUMERIC(3,2) | Média agregada das avaliações recebidas |
| `rating_count` | INTEGER | Quantidade agregada de avaliações recebidas |
| `onboarding_completed_at` | TIMESTAMPTZ | Quando completou onboarding |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**RLS:** SELECT público (profiles com `profile_public = true`); INSERT/UPDATE somente próprio dono.

**Trigger:** `kc_handle_new_user` — cria row em `profiles` automaticamente ao criar usuário em `auth.users`.

---

### `posts` — Publicações

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `legacy_id` | TEXT UNIQUE | **[DEPRECATED v9.0.4]** ID legado (importação v6/v7). Verificar `kc_admin_legacy_id_stats()` antes de remover. |
| `author_id` | UUID FK | Referencia `profiles.id` |
| `title` | TEXT | Título do post |
| `description` | TEXT | Descrição completa |
| `price` | NUMERIC | Preço em BRL (NULL se sem preço) |
| `location` | TEXT | Localização textual |
| `module` | TEXT | `'compra-venda'` / `'caronas'` / `'moradia'` / `'eventos'` / `'oportunidades'` / `'achados-perdidos'` |
| `category` | TEXT | Label da categoria selecionada |
| `metadata` | JSONB | Dados extras do módulo (tipo, topico, status, etc.) |
| `status` | TEXT | `'published'` / `'hidden'` / `'expired'` / `'pending'` / `'deleted'` |
| `visibility` | TEXT | `'public'` / `'private'` |
| `expires_at` | TIMESTAMPTZ | Data de expiração (7d caronas, 30d outros) |
| `bumped_at` | TIMESTAMPTZ | Última vez que foi bumped (cooldown 1d) |
| `last_comment_at` | TIMESTAMPTZ | Data do comentário mais recente (feed `comentados`) |
| `votos` | INTEGER | Contagem de votos positivos líquidos |
| `coupon_clicks` | INTEGER | Cliques no CTA (contador de engajamento) |
| `share_count` | INTEGER | Compartilhamentos |
| `highlight_score` | NUMERIC | Score calculado para "destaques" |
| `moderation_reason` | TEXT | **[v9.3.2]** Razão da auto-moderação: `flood_control`, `link_spam`, `new_user_scrutiny`. NULL = sem moderação automática. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**RLS:**
- SELECT: público (status='published', visibility='public') + próprio autor + admin
- INSERT: apenas autenticado (author_id = auth.uid())
- UPDATE: próprio autor ou admin
- DELETE: próprio autor (apenas status published/pending) ou admin (qualquer)

**Triggers:**
- `kc_set_post_expires_at` — define `expires_at` ao criar post
- `trg_anti_spam_gate` — **[v9.3.2]** BEFORE INSERT: flood control (max 3/h), link spam (>3 URLs→pending), new user trust (<7d + 0 posts→pending)

---

### `post_media` — Imagens dos Posts

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `post_id` | UUID FK | Referencia `posts.id` (CASCADE DELETE) |
| `url` | TEXT | URL pública no Storage |
| `path` | TEXT | Caminho no Storage `kino-media/post-media/` |
| `is_cover` | BOOLEAN | É a imagem de capa |
| `sort_order` | INTEGER | Ordem na galeria |
| `created_at` | TIMESTAMPTZ | |

**RLS:** SELECT público; INSERT/DELETE somente dono do post.

---

### `comments` — Comentários

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `post_id` | UUID FK | Referencia `posts.id` (CASCADE DELETE) |
| `author_id` | UUID FK | Referencia `profiles.id` |
| `content` | TEXT | Conteúdo (suporta markdown inline) |
| `parent_id` | UUID FK | *(v9.1.1)* Para threading — referencia `comments.id` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:** SELECT público; INSERT author_id = auth.uid(); UPDATE/DELETE próprio autor ou admin.

---

> **Nota v9.1.1:** a tabela `comments` no repositório usa os campos `author_name`, `body`, `likes` e `parent_id`. A migration `v9.1.1.0_comment_threading.sql` adiciona `parent_id` e o trigger `kc_check_comment_depth` para limitar o threading a 1 nível.

### `post_votes` — Votos

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `post_id` | UUID FK | Referencia `posts.id` (CASCADE DELETE) |
| `user_id` | UUID FK | Referencia `profiles.id` |
| `direction` | TEXT | `'up'` ou `'down'` |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE:** `(post_id, user_id)` — 1 voto por usuário por post.

**RLS:** SELECT público; INSERT/DELETE próprio user_id.

---

### `comment_likes` — Curtidas em Comentários

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `comment_id` | UUID FK | Referencia `comments.id` (CASCADE DELETE) |
| `user_id` | UUID FK | Referencia `profiles.id` |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE:** `(comment_id, user_id)` — 1 curtida por usuário por comentário.

---

### `saved_posts` — Posts Salvos

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `post_id` | UUID FK | Referencia `posts.id` (CASCADE DELETE) |
| `user_id` | UUID FK | Referencia `profiles.id` |
| `kind` | TEXT | `'like'` / `'bookmark'` / custom |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE:** `(post_id, user_id, kind)` — 1 salvo por tipo por usuário.

**RLS:** SELECT/INSERT/DELETE somente próprio user_id.

---

### `user_ratings` — Avaliações entre Usuários *(v9.1.2.0)*

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `target_user_id` | UUID FK | Usuário avaliado (`profiles.id`) |
| `rater_user_id` | UUID FK | Usuário que avaliou (`profiles.id`) |
| `context_post_id` | UUID FK NULL | Post do alvo que contextualiza a avaliação |
| `rating` | SMALLINT | Nota entre `1` e `5` |
| `comment` | TEXT | Comentário opcional (máx. 280 chars) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**UNIQUE:** `(rater_user_id, target_user_id)` — uma avaliação por relação avaliador → avaliado.

**Checks:**
- `rating between 1 and 5`
- `char_length(comment) <= 280`
- `target_user_id <> rater_user_id`

**RLS:** SELECT/INSERT/UPDATE apenas para o próprio avaliador e/ou alvo autenticado; leitura pública agregada acontece via RPCs.

**Triggers / helpers:**
- `kc_user_ratings_set_updated_at()` — atualiza `updated_at`
- `kc_sync_profile_rating_aggregates(uuid)` — recalcula `profiles.rating_avg` / `profiles.rating_count`
- `kc_user_ratings_sync_target()` — sincroniza agregados após `INSERT/UPDATE/DELETE`

**RPCs públicas relacionadas:**
- `kc_get_user_rating_summary()`
- `kc_get_user_rating_state()`
- `kc_list_user_ratings()`
- `kc_upsert_user_rating()`

---

### `reports` — Denúncias

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `post_id` | UUID FK | Post denunciado |
| `reporter_id` | UUID FK | Quem denunciou |
| `reason` | TEXT | Motivo (spam, inappropriate, etc.) |
| `details` | TEXT | Detalhes opcionais |
| `status` | TEXT | `'open'` / `'closed'` / `'archived'` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:** INSERT qualquer auth; SELECT/UPDATE somente admin.

---

### `hero_banners` — Banners do Carousel

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `title` | TEXT | Título do banner |
| `subtitle` | TEXT | Subtítulo |
| `pill_text` | TEXT | Texto da pill/badge |
| `button_text` | TEXT | Texto do CTA |
| `button_url` | TEXT | Link do CTA |
| `icon_class` | TEXT | Classe Font Awesome |
| `gradient_from` | TEXT | Cor inicial do gradiente (hex) |
| `gradient_to` | TEXT | Cor final do gradiente (hex) |
| `sort_order` | INTEGER | Ordem de exibição |
| `is_active` | BOOLEAN | Visível na homepage |
| `created_at` | TIMESTAMPTZ | |

**RLS:** SELECT banners ativos (is_active = true) para todos + SELECT todos para admin; WRITE somente admin.

---

### `post_limits` — Limites de Posts

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `user_id` | UUID | NULL = default global; UUID = configuração por usuário |
| `module` | TEXT | Módulo alvo (NULL = todos) |
| `limit_count` | INTEGER | Número máximo de posts ativos |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Default:** 5 posts ativos por módulo por usuário.

---

### `search_queries` — Analytics de Busca

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `term` | TEXT | Termo buscado |
| `session_id` | TEXT | ID da sessão do browser |
| `user_id` | UUID | FK opcional (se autenticado) |
| `created_at` | TIMESTAMPTZ | |

**RLS:** INSERT qualquer um; SELECT somente admin.
**Retenção:** `kc_prune_old_analytics()` remove entradas com `created_at < now() - interval '6 months'` — pg_cron mensal (v9.0.4).
**Índice:** `idx_search_queries_created_at` — para DELETE eficiente na retenção.

---

### `audit_log` — Log de Auditoria

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `action` | TEXT | Nome da ação (ex: `posts_bumped`, `post_renewed`) |
| `entity_type` | TEXT | Tipo de entidade (ex: `post`, `profile`) |
| `entity_id` | UUID | ID da entidade afetada |
| `actor_id` | UUID | FK quem fez a ação |
| `payload` | JSONB | Dados da ação |
| `created_at` | TIMESTAMPTZ | |

**RLS:** INSERT via sistema; SELECT somente admin.
**Retenção:** `kc_prune_old_analytics()` remove entradas com `created_at < now() - interval '1 year'` — pg_cron mensal (v9.0.4).
**Índice:** `idx_audit_log_created_at` — para DELETE eficiente na retenção.

---

### `help_requests` — Tickets de Suporte

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `user_id` | UUID FK | Quem abriu (pode ser NULL) |
| `subject` | TEXT | Assunto |
| `message` | TEXT | Mensagem |
| `status` | TEXT | `'open'` / `'closed'` / `'in_progress'` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `resolved_at` | TIMESTAMPTZ | |

---

### `home_category_affinity` — Personalização da Homepage

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `category` | TEXT | Categoria de afinidade |
| `affinity_score` | NUMERIC | Score (calculado pelo sistema) |
| `last_updated` | TIMESTAMPTZ | |

---

### `post_view_events` — Eventos de Visualizacao (v9.3.1)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID PK | gen_random_uuid() |
| post_id | UUID FK posts(id) ON DELETE CASCADE | Post visualizado |
| user_id | UUID FK auth.users(id) ON DELETE SET NULL | Usuario que visualizou (nullable) |
| session_id | TEXT | Sessao (futuro: views anonimas) |
| created_at | TIMESTAMPTZ | Momento da visualizacao |

**RLS:** INSERT para authenticated (user_id = auth.uid()); SELECT para autor do post + admin.

### `notifications` — Notificações In-App (v9.1.0)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `user_id` | UUID FK | Referencia `profiles.id` (CASCADE DELETE) |
| `type` | TEXT | `'comment_on_post'` / `'vote_on_post'` / `'post_expired'` / `'post_reported'` / `'comment_reply'` / `'system'` |
| `title` | TEXT | Título da notificação |
| `body` | TEXT | Corpo/preview |
| `data` | JSONB | Dados extras (post_id, actor_id, module, etc.) |
| `read` | BOOLEAN | Lida pelo usuário |
| `created_at` | TIMESTAMPTZ | |

**RLS:** SELECT/UPDATE/DELETE somente próprio user_id. INSERT via triggers (SECURITY DEFINER).
**Realtime:** Habilitado para push em tempo real (`supabase_realtime` publication).
**Retenção:** `kc_prune_old_notifications()` remove lidas > 90 dias — pg_cron mensal.
**Triggers:** `kc_notify_on_comment`, `kc_notify_on_vote`, `kc_notify_on_post_expire`.

---

## Indexes

```sql
idx_posts_author_created_desc  ON posts(author_id, created_at DESC)  -- v9.3.2: flood control
idx_posts_module_created     ON posts(module, created_at)
idx_posts_category_created   ON posts(category, created_at)
posts_bumped_at_idx          ON posts(bumped_at DESC NULLS LAST)        -- feed recentes
posts_last_comment_at_idx    ON posts(last_comment_at DESC NULLS LAST)  -- feed comentados
posts_highlight_score_idx    ON posts(highlight_score DESC)             -- feed votos
idx_comments_author_created  ON comments(author_id, created_at)
idx_post_votes_user_post     ON post_votes(user_id, post_id)
idx_saved_posts_user         ON saved_posts(user_id)
idx_reports_post_status      ON reports(post_id, status)
user_ratings_target_created_idx ON user_ratings(target_user_id, created_at DESC, id DESC)
user_ratings_rater_idx       ON user_ratings(rater_user_id)
user_ratings_context_post_idx ON user_ratings(context_post_id)
idx_search_queries_term        ON search_queries(term)
idx_search_queries_created_at  ON search_queries(created_at)      -- v9.0.4
idx_audit_log_created_at       ON audit_log(created_at)           -- v9.0.4
idx_notifications_user_created ON notifications(user_id, created_at DESC)  -- v9.1.0
idx_notifications_user_unread  ON notifications(user_id) WHERE read=false  -- v9.1.0
idx_posts_fts                  ON posts USING GIN(kc_posts_search_document(title, description, category, metadata)) WHERE legacy_id IS NULL  -- v9.2.0
posts_metadata_gin_idx         ON posts USING GIN(metadata)
idx_post_view_events_dedup     ON post_view_events(post_id, user_id, created_at DESC) WHERE user_id IS NOT NULL  -- v9.3.1
idx_post_view_events_post_id   ON post_view_events(post_id)                          -- v9.3.1
idx_post_view_events_created_at ON post_view_events(created_at)                      -- v9.3.1
idx_posts_view_count           ON posts(view_count DESC) WHERE status = 'published'  -- v9.3.1
```

**Paginação v9.2.2:** o feed incremental usa a RPC `kc_get_feed_cursor()` com cursor opaco. A ordenação preserva `bumped_at`, `last_comment_at` ou `highlight_score` conforme o tipo de feed.

**Filtros v9.2.1.1:** a RPC `kc_get_feed_cursor(..., p_request_params jsonb)` passou a aplicar server-side os filtros avançados já existentes de `compra-venda`, `caronas`, `moradia`, `oportunidades` e `achados-perdidos`, sem alterar a semântica pública do cursor.

**Faixas numéricas v9.2.1.2:** `kc_get_feed_cursor()` passou a aceitar `priceMin` e `priceMax` dentro de `p_request_params`, aplicando o intervalo diretamente sobre `posts.price` e normalizando limites invertidos no banco.

**Presets de data v9.2.1.3:** `kc_get_feed_cursor()` passou a aceitar `datePreset` dentro de `p_request_params`, aplicando server-side a mesma semântica do client em `America/Sao_Paulo`. `eventos` usa `metadata.data_evento` / `metadata.data` com fallback para `created_at`; os demais módulos usam recência por `created_at`.

**Busca v9.2.0:** a busca server-side usa `kc_search_posts_fts()` com `unaccent + portuguese`, expansão de sinônimos no client e documento ponderado por `title`, `tags`, `description`, `category` e `subcategory`.

**Hardening v9.2.3:** os helpers de feed e busca sinalizados pelo Security Advisor agora fixam `SET search_path = ''` e usam referencias qualificadas, removendo os warnings `function_search_path_mutable` sem alterar contratos publicos. A extensao de `v9.2.1.3` manteve esse mesmo padrao para `kc_get_feed_cursor()` e os novos helpers de data. Permanecem pendentes e separados desta iteracao: `extension_in_public` para `unaccent` e `auth_leaked_password_protection`.

**Analytics de post v9.3.1:** `posts.view_count` armazena contagem denormalizada de visualizacoes. `post_view_events` registra eventos granulares com anti-spam (1 view/usuario/post/hora). Self-views (autor vendo proprio post) nao contam. Retencao: 6 meses via `kc_prune_old_analytics()`. RPCs: `kc_track_view(p_post_id)` para registrar, `kc_get_post_analytics(p_post_id)` para metricas (autor-only).

**Reputacao v9.1.2.0:** a fundacao de `user_ratings` adiciona agregados em `profiles`, triggers de sincronizacao e RPCs dedicadas com `SET search_path = ''`. A elegibilidade usa apenas interacoes persistidas (`comments`, `post_votes`, `saved_posts`) e a identidade do avaliador pode ser anonimizada nas listagens publicas.

## Storage Buckets

**`kino-media`** (público para leitura):
- `profile-avatars/{userId}/{timestamp}-avatar.{ext}` — avatares
- `post-media/{userId}/{postId}/{timestamp}-image-N.{ext}` — imagens de posts

**RLS Storage:**
- SELECT: público
- INSERT: somente autenticado
- UPDATE/DELETE: somente owner (auth.uid() = owner)

## pg_cron Jobs

```sql
-- Expira posts diariamente às 03:00
SELECT cron.schedule('kc-expire-old-posts', '0 3 * * *', 'SELECT public.kc_expire_old_posts()');

-- (v9.0.4 + v9.3.1) Purga analytics mensalmente às 04:00 (dia 1 de cada mês)
SELECT cron.schedule('kc-prune-analytics', '0 4 1 * *', 'SELECT public.kc_prune_old_analytics()');
-- search_queries: remove > 6 meses | audit_log: remove > 1 ano | post_view_events: remove > 6 meses

-- (v9.1.0) Purga notificações lidas mensalmente às 05:00 (dia 1 de cada mês)
SELECT cron.schedule('kc-prune-notifications', '0 5 1 * *', 'SELECT public.kc_prune_old_notifications()');
-- Remove notificações lidas > 90 dias
```
