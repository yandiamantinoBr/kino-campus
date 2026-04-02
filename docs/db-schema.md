# KinoCampus — Schema do Banco de Dados

**Banco:** PostgreSQL (Supabase) | **Migrações aplicadas:** 58 (até v8.5.0.0)

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
| `legacy_id` | TEXT UNIQUE | ID legado (importação v6/v7) — deprecar em v9 |
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
| `votos` | INTEGER | Contagem de votos positivos líquidos |
| `coupon_clicks` | INTEGER | Cliques no CTA (contador de engajamento) |
| `share_count` | INTEGER | Compartilhamentos |
| `highlight_score` | NUMERIC | Score calculado para "destaques" |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**RLS:**
- SELECT: público (status='published', visibility='public') + próprio autor + admin
- INSERT: apenas autenticado (author_id = auth.uid())
- UPDATE: próprio autor ou admin
- DELETE: próprio autor (apenas status published/pending) ou admin (qualquer)

**Trigger:** `kc_set_post_expires_at` — define `expires_at` ao criar post.

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
**Retenção:** Purgar entradas com `created_at < now() - interval '6 months'` (v9.0.4).

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
**Retenção:** Purgar entradas com `created_at < now() - interval '1 year'` (v9.0.4).

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

## Indexes

```sql
idx_posts_author_created     ON posts(author_id, created_at)
idx_posts_module_created     ON posts(module, created_at)
idx_posts_category_created   ON posts(category, created_at)
idx_comments_author_created  ON comments(author_id, created_at)
idx_post_votes_user_post     ON post_votes(user_id, post_id)
idx_saved_posts_user         ON saved_posts(user_id)
idx_reports_post_status      ON reports(post_id, status)
idx_search_queries_term      ON search_queries(term)
posts_metadata_gin_idx       ON posts USING GIN(metadata)
```

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

-- (v9.0.4) Purga analytics mensalmente às 04:00
SELECT cron.schedule('kc-prune-analytics', '0 4 1 * *', 'SELECT public.kc_prune_old_analytics()');
```
