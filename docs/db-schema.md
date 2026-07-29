# KinoCampus — Schema do Banco de Dados

**Banco:** PostgreSQL (Supabase) | **Fonte de verdade:** migrations SQL ativas em `supabase/migrations/`

> **Estado documental:** 2026-07-29, incluindo o hardening de autorização
> `20260728234000`, a reconciliação de workers privados `20260728235000`, o
> arquivamento seguro de conversas `20260729000000`, a reconciliação global dos
> guards de sessão `20260729001000` e o expand session-bound de exportação
> administrativa `20260729006000`. As anotações `v9.x`/`v11.x` continuam como
> marcadores históricos de introdução. Não se mantém contagem manual: a presença
> local de uma migration não comprova aplicação no projeto remoto.

> Atualização operacional em 2026-06-11: o advisor remoto indicou `auth_leaked_password_protection` como WARN; `extension_in_public` (`unaccent`) não apareceu como advisor ativo nessa leitura, mas segue como histórico/watchlist. Não mover extensão nem alterar Auth Dashboard por migration improvisada; seguir `docs/ops/v19-operational-runbook.md` e `docs/ops/v28-unaccent-fts-dependency-audit.md`.

> Atualizacao operacional em 2026-06-12: probe read-only no Supabase remoto confirmou `unaccent`
> instalado em `extensions` (`extversion=1.1`) e Advisor de seguranca sem lint `extension_in_public`.
> O residual ativo de seguranca continua sendo `auth_leaked_password_protection`; nao aplicar
> migration para `unaccent` no estado atual.

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
| `author_id` | UUID FK NULL | Referencia `profiles.id`; `ON DELETE SET NULL` preserva conteúdo necessário após exclusão da conta |
| `title` | TEXT | Título do post |
| `description` | TEXT | Descrição completa |
| `price` | NUMERIC | Preço em BRL (NULL se sem preço) |
| `location` | TEXT | Localização textual |
| `module` | TEXT | `'compra-venda'` / `'caronas'` / `'moradia'` / `'eventos'` / `'oportunidades'` / `'achados-perdidos'` |
| `category` | TEXT | Label da categoria selecionada |
| `image_url` | TEXT | URL canônica da imagem de capa; fallback direto quando `post_media`/OG não resolvem |
| `metadata` | JSONB | Dados extras do módulo (tipo, topico, status, etc.) |
| `status` | TEXT | `'published'` / `'pending'` / `'hidden'` / `'deleted'` / `'expired'` / `'closed'` |
| `visibility` | TEXT | `'public'` / `'community'` |
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
- SELECT anônimo: conteúdo `published`/`closed` com `visibility='public'`
- SELECT autenticado: conteúdo `published`/`closed` com `visibility IN ('public','community')`, além do próprio autor e admin
- INSERT: apenas autenticado (author_id = auth.uid())
- UPDATE: próprio autor ou admin
- DELETE: próprio autor (apenas status published/pending) ou admin (qualquer)

As RPCs endurecidas em `20260728234000` reutilizam `kc_can_read_post(...)` para não divergir dessa fronteira. Contagens de categoria, estado de avaliação e contadores de share/cupom não confirmam posts invisíveis. `kc_get_personalized_tabs(...)` é ainda mais estrita: usa apenas `status='published'`, com `public` para `anon` e `public/community` para autenticado.

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
| `created_at` | TIMESTAMPTZ | |
| `post_id` | UUID FK | Referencia `posts.id` (CASCADE DELETE) |
| `voter_id` | UUID FK | Referencia `profiles.id` |
| `direction` | TEXT | `'hot'` ou `'cold'` |

**UNIQUE:** `(post_id, voter_id)` — 1 voto por usuário por post.

**RLS:** SELECT público; INSERT/DELETE próprio `voter_id`.

**Nota v11.20.2:** a função `kc_notify_on_vote()` foi realinhada ao contrato atual desta tabela. A documentação antiga ainda descrevia `user_id` e `up/down`, mas o banco real vigente usa `voter_id` e `hot/cold`.

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
| `kind` | TEXT | `'favorite'` / `'later'` / `'highlight'` |
| `created_at` | TIMESTAMPTZ | |

**UNIQUE:** `(post_id, user_id, kind)` — 1 salvo por tipo por usuário.

**RLS:**
- SELECT/INSERT/UPDATE/DELETE do próprio `user_id`
- SELECT público apenas para linhas `kind = 'highlight'` ligadas a posts ainda publicados

**Notas de contrato:**
- `favorite`: favorito pessoal
- `later`: lembrar depois
- `highlight`: destaque público elegível para perfil/ranking

---

### `user_ratings` — Avaliações entre Usuários *(v9.1.2.0)*

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `target_user_id` | UUID FK NULL | Usuário avaliado; `ON DELETE SET NULL` após exclusão da conta |
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

**RLS:** SELECT/INSERT/UPDATE apenas para o próprio avaliador e/ou alvo autenticado; leitura agregada acontece via RPCs. Desde `20260728234000`, resumo de perfil privado só é real para titular/admin/service; caller não relacionado recebe `{ average: null, count: 0 }`. O estado de avaliação também valida a visibilidade do perfil e do post de contexto antes de revelar existência/interação.

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

### `post_flood_limits` — Limites de Ritmo de Publicação

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `user_id` | UUID | NULL = default global; UUID = configuração por usuário |
| `module` | TEXT | Módulo alvo (NULL = todos) |
| `max_posts` | INTEGER | Número máximo de posts criados dentro da janela |
| `window_minutes` | INTEGER | Janela móvel em minutos |
| `created_by` | UUID | Admin que criou/alterou o limite |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Default:** 3 posts a cada 60 minutos por usuário, preservado como fallback quando não há override.
**Uso:** trigger `kc_anti_spam_gate()` e RPC `kc_check_post_flood_limit(...)`.
**Admin:** configurável em `/admin/moderation.html`, no painel de limites.

---

### `search_queries` — Analytics de Busca

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `term` | TEXT | Termo buscado |
| `session_id` | TEXT | Hash SHA-256 da sessão efêmera; o valor cru não é persistido |
| `user_id` | UUID | Coluna legada, obrigada a `NULL` por constraint |
| `created_at` | TIMESTAMPTZ | Definido pelo servidor |

**RLS/ACL:** SELECT somente admin. INSERT direto de `anon`/`authenticated` revogado; a ingestão consentida usa `kc_ingest_search_queries(text, jsonb)` com validação de lote, rejeição de PII/URL/credencial, dedupe e rate limit básico por hash de sessão.
**Retenção:** `kc_prune_old_analytics()` remove entradas com `created_at < now() - interval '6 months'` — pg_cron mensal (v9.0.4).
**Índices:** `idx_search_queries_created_at` para retenção e `idx_search_queries_session_created_at` para dedupe/rate limit.

O rate limit por sessão reduz rajadas, mas pode ser contornado pela rotação do identificador local. Ele não deve ser tratado como proteção forte contra abuso distribuído.

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
| `type` | TEXT | `'question'` / `'platform_issue'` / `'account_access'` / `'report'` / `'suggestion_praise'` |
| `topic` | TEXT | Tópico principal normalizado do pedido |
| `subtopic` | TEXT | Subtópico opcional |
| `subject` | TEXT | Assunto |
| `message` | TEXT | Mensagem |
| `priority` | TEXT | `'low'` / `'normal'` / `'high'` / `'urgent'` |
| `status` | TEXT | `'new'` / `'triaged'` / `'in_progress'` / `'resolved'` / `'archived'` |
| `page_path` | TEXT | Caminho da página de origem, quando enviado |
| `contact_email` | TEXT | E-mail alternativo de retorno |
| `allow_contact` | BOOLEAN | Consentimento para contato |
| `metadata` | JSONB | Dados auxiliares do formulário |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:**
- INSERT por `anon` e `authenticated`
- SELECT do próprio usuário autenticado ou admin
- UPDATE apenas admin

**Nota v10:** o admin usa esta tabela `public.help_requests` como fonte canônica. A paginação server-side passou a usar `public.kc_admin_list_help_requests_paged(...)`, sem criar tabela paralela.

**Nota de integridade 20260729011000:** o formulário público grava pelo RPC
`kc_create_help_request_with_notification_claim_v2(jsonb)`. O wrapper compara
`expected_auth_state` e `expected_user_id` ao contexto Auth atual antes de chamar
o corpo legado. Rascunhos visitantes não podem adquirir uma conta que apareça
durante o envio; usuários Auth anônimos também são persistidos com `user_id`
nulo até verificação e vínculo auditados.

---

### `home_category_affinity` — Personalização da Homepage

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `owner_kind` | TEXT | `'user'` ou formato legado `'session'` |
| `owner_key` | TEXT | Chave única do owner; para usuário deve ser `user_id::text` |
| `user_id` | UUID FK NULL | Titular autenticado; `ON DELETE CASCADE` |
| `session_id` | TEXT NULL | Campo legado; novas afinidades server-side não usam sessão |
| `module_key` | TEXT | Módulo normalizado |
| `category_key` | TEXT | Categoria normalizada |
| `score` | NUMERIC(12,2) | Score acumulado |
| `interactions_count` | INTEGER | Número acumulado de interações |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado |

**UNIQUE:** `(owner_kind, owner_key, module_key, category_key)`.

**Privacidade/ACL desde `20260728234000`:**

- linhas anônimas `owner_kind='session'` foram removidas e não voltam a ser criadas pelas RPCs;
- `kc_track_home_category_affinity` e `kc_list_home_category_affinity` são `authenticated`-only, vinculam os dados a `auth.uid()` e exigem evento afirmativo de consentimento de analytics;
- o valor cru de `p_session_id` serve apenas para verificar o hash do consentimento e não é gravado na afinidade;
- RLS permite ao autenticado selecionar somente a própria afinidade de usuário; `service_role` mantém acesso operacional;
- `kc_get_personalized_tabs` só usa esse score para o próprio titular consentido. Sem consentimento ou em `anon`, retorna ranking agregado por posts visíveis.

---

### `chat_conversations` — Conversas privadas

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `participant_low` | UUID FK NULL | Participante de menor UUID; `ON DELETE SET NULL` |
| `participant_high` | UUID FK NULL | Participante de maior UUID; `ON DELETE SET NULL` |
| `created_at` | TIMESTAMPTZ | |
| `last_message_at` | TIMESTAMPTZ NULL | Timestamp denormalizado da última mensagem não apagada |
| `last_message_preview` | TEXT NULL | Preview plaintext de até 120 caracteres, mantido por trigger |
| `last_message_sender` | UUID FK NULL | Remetente da última mensagem; `ON DELETE SET NULL` |
| `last_message_type` | TEXT NULL | `text` / `image` / `audio` / `document` |
| `archived_by_low` | BOOLEAN | Arquivamento do participante low |
| `archived_by_high` | BOOLEAN | Arquivamento do participante high |

O par ordenado é único enquanto ambos os participantes existem. Participantes nullable permitem preservar a conversa necessária para o usuário remanescente após exclusão da outra conta; a listagem retorna nome neutro `Conta excluida`.

### `chat_messages` — Mensagens privadas

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `conversation_id` | UUID FK | Conversa; `ON DELETE CASCADE` |
| `sender_id` | UUID FK NULL | Remetente; `ON DELETE SET NULL` |
| `message_type` | TEXT | `text` / `image` / `audio` / `document` |
| `content` | TEXT NULL | Texto ou legenda; limpo no soft-delete |
| `media_path` | TEXT NULL | Objeto sob o prefixo da conversa/remetente; limpo no soft-delete |
| `e2e_envelope` | JSONB NULL | Envelope opcional de criptografia |
| `created_at` | TIMESTAMPTZ | |
| `edited_at` | TIMESTAMPTZ NULL | |
| `deleted_at` | TIMESTAMPTZ NULL | Soft-delete |
| `read_at` | TIMESTAMPTZ NULL | Checkmark denormalizado |
| `reply_to_id` | UUID FK NULL | Mensagem respondida; `ON DELETE SET NULL` |

### `chat_read_state` — Cursor de leitura por participante

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `conversation_id` | UUID PK/FK | Parte da PK composta |
| `user_id` | UUID PK/FK | Parte da PK composta; `ON DELETE CASCADE` |
| `last_read_msg_id` | UUID FK NULL | Marcador validado da mesma conversa |
| `last_read_at` | TIMESTAMPTZ | Avança monotonicamente |

### `user_blocks` — Bloqueios de chat

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador substituto |
| `blocker_id` | UUID FK | Titular do bloqueio; `ON DELETE CASCADE` |
| `blocked_id` | UUID FK NULL | Alvo ativo; `ON DELETE SET NULL` |
| `blocked_subject_hash` | TEXT | Token aleatório hexadecimal de 64 caracteres, não derivado do UUID |
| `reason` | TEXT NULL | Razão opcional |
| `created_at` | TIMESTAMPTZ | |

**RLS e RPCs do chat:** leitura é limitada aos participantes e estado de leitura/bloqueio ao próprio usuário. A superfície `kc_chat_*` de cliente é `authenticated`-only e os workers `SECURITY DEFINER` ficam em `kc_private`. Start/block/unblock serializam o par com advisory lock; edit/delete exigem remetente; report/mark-read validam participação e a conversa do marcador.

**Arquivamento seguro (`20260729000000`):**

- `PUBLIC`, `anon` e `authenticated` não têm `UPDATE` direto em `chat_conversations`; `service_role` conserva o acesso interno;
- a policy ampla `chat_conv_update_own`, que filtrava linhas mas não limitava colunas, foi removida;
- archive e unarchive passam por `kc_chat_set_conversation_archived(uuid, boolean)`, exigem sessão ativa e participação;
- o worker altera exclusivamente `archived_by_low` ou `archived_by_high`, conforme o lado de `auth.uid()`;
- conversa ausente e conversa de terceiro são indistinguíveis para o caller;
- participantes não podem trocar identidades, adulterar `last_message_*` nem alterar o flag do outro participante.

**Consistência segura do preview (`20260728235000`):**

- `chat_msg_after_insert_denormalize` recalcula `last_message_*` e desarquiva a conversa;
- `chat_msg_after_update_refresh_preview` reage a edição e soft-delete;
- `kc_chat_refresh_conversation_preview` considera somente `deleted_at IS NULL`, desempata por `(created_at DESC, id DESC)` e bloqueia a conversa durante o refresh;
- se a última mensagem for apagada, o preview volta à mensagem não apagada anterior; se não houver outra, todos os campos `last_message_*` ficam `NULL`. Assim, o plaintext apagado não permanece na inbox.

---

### `post_engagement_rate_windows` — Janela de contadores públicos *(20260728234000)*

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `post_id` | UUID PK/FK | Post; `ON DELETE CASCADE` |
| `event_type` | TEXT PK | `share` ou `coupon_click` |
| `window_started_at` | TIMESTAMPTZ PK | Início do dia UTC (`date_trunc('day', now())`) |
| `event_count` | INTEGER | Contagem atômica, `0..1000` |
| `updated_at` | TIMESTAMPTZ | |

**Privacidade/ACL:** não armazena usuário, IP, dispositivo nem sessão. RLS está ativa; `anon`/`authenticated` não têm privilégio de tabela e somente `service_role` mantém acesso direto. O helper privado de claim também não tem `EXECUTE` de API. A migration `20260729001000` reaplica o trigger global e a policy restritiva de sessão ativa, pois esta tabela foi criada depois da instalação inicial dos guards.

**Limites:** `kc_track_share` aceita até 25 eventos por post/dia e `kc_track_coupon_click` até 50. Ambas exigem post publicado e visível ao caller. Ao esgotar a janela retornam `RATE_LIMITED` com `counted=false`, sem alterar o agregado editorial; janelas anteriores a 30 dias são podadas oportunisticamente.

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
| `type` | TEXT | `'comment_on_post'` / `'vote_on_post'` / `'post_expired'` / `'post_reported'` / `'comment_reply'` / `'direct_message'` / `'system'` |
| `title` | TEXT | Título da notificação |
| `body` | TEXT | Corpo/preview |
| `data` | JSONB | Dados extras (post_id, actor_id, module, etc.) |
| `read` | BOOLEAN | Lida pelo usuário |
| `created_at` | TIMESTAMPTZ | |

**RLS:** SELECT/UPDATE/DELETE somente próprio user_id. INSERT via triggers (SECURITY DEFINER).
**Realtime:** Habilitado para push em tempo real (`supabase_realtime` publication).
**Retenção:** `kc_prune_old_notifications()` remove lidas > 90 dias — pg_cron mensal.
**Triggers:** `kc_notify_on_comment`, `kc_notify_on_comment_reply`, `kc_notify_on_vote`, `kc_notify_on_post_expire`.

**Nota v11.20.1:** os triggers atuais passaram a consultar `kc_notification_channel_enabled(...)` antes de inserir notificações in-app. O comportamento canônico segue sendo `in_app=true` por default para usuários sem preferências persistidas.

**Nota v11.20.2:** os triggers de comentário, reply, voto e expiração passaram a delegar a emissão para `kc_emit_notification_event(...)`. Essa helper insere em `public.notifications` apenas quando `in_app` estiver habilitado e cria/atualiza items de `notification_delivery_outbox` para canais externos.

---

### `notification_preferences` — Preferências Privadas de Notificação (v11.20.1)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `user_id` | UUID PK/FK | Referencia `profiles.id` (CASCADE DELETE) |
| `preferences` | JSONB | Matriz `{ evento -> { in_app, email, whatsapp } }` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**RLS:** SELECT/INSERT/UPDATE/DELETE apenas do próprio `user_id` autenticado.

**Defaults canônicos:** gerados por `kc_default_notification_preferences()` com `in_app=true`, `email=false` e `whatsapp=false` para `comment_on_post`, `comment_reply`, `vote_on_post`, `post_expired`, `post_reported` e `system`.

**Helpers:**
- `kc_default_notification_preferences()` — devolve o JSONB canônico de defaults
- `kc_notification_channel_enabled(uuid, text, text)` — consulta se um determinado canal está habilitado para um evento, com fallback backfill-safe quando o usuário ainda não possui row em `notification_preferences`

---

### `notification_channel_targets` — Destinos Privados de Canais Externos (v11.21.1)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `user_id` | UUID PK/FK | Referencia `profiles.id` (CASCADE DELETE) |
| `channel` | TEXT PK | Nesta fase, apenas `whatsapp` |
| `destination` | TEXT | Destino privado em E.164 (`+5562998765432`) |
| `consent_granted` | BOOLEAN | Opt-in explicito para uso do canal |
| `consent_at` | TIMESTAMPTZ | Momento em que o consentimento vigente foi concedido |
| `metadata` | JSONB | Metadados complementares, incluindo `country_code` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**RLS:** SELECT/INSERT/UPDATE/DELETE apenas do proprio `user_id` autenticado.

**Checks:**
- `channel = 'whatsapp'`
- `destination` deve obedecer ao formato E.164

**Helpers / triggers:**
- `kc_touch_notification_channel_target_consent()` — recalcula `consent_at` quando o consentimento muda ou quando o numero privado e alterado
- `kc_count_recent_notification_deliveries(uuid, text, timestamptz)` — conta envios recentes para rate limit operacional do dispatcher
- `kc_resolve_notification_delivery_destination(uuid, text)` — passa a resolver `whatsapp` a partir desta tabela privada, sem reaproveitar o contato publico do perfil

---

### `notification_delivery_outbox` — Fila Privada de Entrega Externa (v11.20.2)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `notification_id` | UUID FK NULL | Referencia opcional `notifications.id` (SET NULL em delete) |
| `user_id` | UUID FK | Referencia `profiles.id` (CASCADE DELETE) |
| `event_type` | TEXT | `comment_on_post`, `comment_reply`, `vote_on_post`, `post_expired`, `post_reported`, `system` |
| `channel` | TEXT | `email` ou `whatsapp` |
| `status` | TEXT | `queued`, `processing`, `sent`, `failed`, `blocked`, `cancelled`, `skipped` |
| `destination` | TEXT | Destino privado resolvido para o canal |
| `destination_source` | TEXT | Origem do destino privado (`auth.users.email`, `private.whatsapp`, etc.) |
| `payload` | JSONB | Payload canônico para entrega externa |
| `attempts_count` | INTEGER | Quantidade de tentativas já executadas |
| `last_attempt_at` | TIMESTAMPTZ | |
| `next_attempt_at` | TIMESTAMPTZ | |
| `locked_at` | TIMESTAMPTZ | Lock de processamento |
| `locked_by` | TEXT | Worker/função que segurou o item |
| `sent_at` | TIMESTAMPTZ | |
| `error_code` | TEXT | |
| `error_message` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**RLS:** nenhuma policy para `anon`/`authenticated`; uso reservado a `service_role`.

**Observações operacionais:**
- `notification_id` pode ser `NULL` quando o usuário desligou `in_app` mas manteve canal externo ligado.
- o canal `whatsapp` depende de `notification_channel_targets`, com numero privado valido e `consent_granted=true`; o WhatsApp publico do perfil nao e reutilizado automaticamente.
- o helper canônico desta trilha é `kc_emit_notification_event(...)`, que mantém `public.notifications` como feed in-app e alimenta o outbox externo de forma desacoplada.
- **Nota v11.21.0:** a fila passou a expor `kc_claim_notification_delivery_batch(...)` para claim atômico com recuperação de locks stale e `kc_record_notification_delivery_attempt(...)` para registrar tentativas e atualizar o outbox de forma consistente.
- **Nota v11.21.0:** o canal `email` já tem dispatcher real na Edge Function `kc-dispatch-notification-outbox`, mas o envio permanece gated até existirem `KC_NOTIFICATION_EMAIL_PROVIDER`, `KC_NOTIFICATION_EMAIL_API_KEY` e `KC_NOTIFICATION_EMAIL_FROM` no projeto Supabase.
- **Nota v11.21.1:** o canal `whatsapp` agora tem dispatcher real via Twilio, mas o envio continua gated ate existirem `KC_NOTIFICATION_WHATSAPP_PROVIDER`, `KC_NOTIFICATION_WHATSAPP_ACCOUNT_SID`, `KC_NOTIFICATION_WHATSAPP_AUTH_TOKEN`, `KC_NOTIFICATION_WHATSAPP_FROM` e `KC_NOTIFICATION_WHATSAPP_CONTENT_SID`.
- **Nota v11.22.0:** a fila passa a ter consumo automático versionado pelo helper `kc_trigger_notification_dispatch(...)` e pelo job `pg_cron` `kc-dispatch-notification-outbox`, mantendo fail-closed quando os settings de banco do dispatcher ainda não existirem.

---

### `notification_delivery_attempts` — Histórico de Tentativas Externas (v11.20.2)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `outbox_id` | UUID FK | Referencia `notification_delivery_outbox.id` (CASCADE DELETE) |
| `channel` | TEXT | `email` ou `whatsapp` |
| `status` | TEXT | `processing`, `sent`, `failed`, `blocked`, `cancelled`, `skipped` |
| `provider` | TEXT | Nome do provider externo utilizado |
| `response_code` | TEXT | Código/resumo de retorno do provider |
| `response_body` | JSONB | Corpo resumido da tentativa |
| `error_message` | TEXT | |
| `attempted_at` | TIMESTAMPTZ | |

**RLS:** nenhuma policy para `anon`/`authenticated`; uso reservado a `service_role`.

---

### `notification_dispatch_runtime` — Runtime Privado do Scheduler (v11.22.0)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `slot` | TEXT PK | Nesta fase, apenas `primary` |
| `function_url` | TEXT NULL | URL publica da Edge Function `kc-dispatch-notification-outbox` |
| `dispatch_secret` | TEXT | Segredo privado usado pelo scheduler |
| `batch_limit` | INTEGER | Limite padrao de rows por execucao |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | Auto-atualizado por trigger |

**RLS:** nenhuma policy para `anon`/`authenticated`; uso reservado a `service_role`.

**Observações operacionais:**
- a migration insere automaticamente a row `slot='primary'`
- `dispatch_secret` e gerado no banco no primeiro insert
- `function_url` deve apontar para `https://<project-ref>.functions.supabase.co/kc-dispatch-notification-outbox`
- `app.settings.kc_notification_dispatch_*` permanecem apenas como fallback operacional

---

### `notification_dispatch_runs` — Log Privado de Execuções do Dispatcher (v11.22.0)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `execution_id` | TEXT | Identificador lógico da execução |
| `source` | TEXT | Origem da execução (`manual`, `pg_cron`, etc.) |
| `mode` | TEXT | `dry_run` ou `dispatch` |
| `channel_filter` | TEXT NULL | `email`, `whatsapp` ou `NULL` para multicanal |
| `status` | TEXT | `completed` ou `error` |
| `batch_limit` | INTEGER | Limite usado na execução |
| `provider_ready` | JSONB | Estado de readiness dos providers por canal |
| `provider_issues` | JSONB | Problemas de configuração por canal |
| `summary` | JSONB | Resumo operacional da execução |
| `error_code` | TEXT | Código resumido de falha quando aplicável |
| `error_message` | TEXT | Mensagem resumida de falha quando aplicável |
| `created_at` | TIMESTAMPTZ | |

**RLS:** nenhuma policy para `anon`/`authenticated`; uso reservado a `service_role`.

**Observações operacionais:**
- alimentada pela Edge Function `kc-dispatch-notification-outbox`
- registra tanto `dry_run` quanto `dispatch`
- não substitui `notification_delivery_attempts`; complementa a observabilidade em nível de execução

---

### `data_subject_requests` — Protocolos de titulares *(20260728183022+)*

Registro público mínimo de pedidos autenticados de acesso/cópia,
portabilidade e exclusão. O pacote exportado não é persistido nesta tabela.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | UUID PK | Identificador interno |
| `protocol` | TEXT UNIQUE | Formato aleatório `KC-DSR-YYYYMMDD-{16 hex}`; não deriva de e-mail/UUID |
| `user_id` | UUID FK `auth.users` | Titular; `ON DELETE SET NULL` para preservar recibo mínimo |
| `help_request_id` | UUID FK `help_requests` | Atendimento vinculado, quando houver |
| `subject_hash` | TEXT | Token opaco aleatório de 64 hex; não é hash de e-mail |
| `request_kind` | TEXT | `data_access_copy`, `data_portability` ou `account_erasure` |
| `status` | TEXT | `received`, `processing`, `ready`, `pending_confirmation`, `completed`, `cancelled`, `failed`, `partial_failure` ou `expired` |
| `idempotency_key` | TEXT | Única por titular/finalidade para retry seguro |
| `request_source` | TEXT | `settings`, `help` ou `api` |
| `requested_format` | TEXT | Somente `json` nesta versão |
| `scope` | JSONB | Categorias solicitadas |
| `ready_at`, `expires_at` | TIMESTAMPTZ | Janela de download; não altera a retenção do protocolo |
| `retention_until` | TIMESTAMPTZ | Revisão/expurgo do recibo mínimo; padrão versionado de 5 anos |

**RLS:** `authenticated` lê apenas `user_id = auth.uid()` com sessão ativa.
Criação, cancelamento e transições passam por RPC/Edge; `anon` não lê a fila.
`failed` e `partial_failure` vencidos não são apagados silenciosamente pelo job
de retenção.

### `data_subject_request_events` — Eventos monotônicos do protocolo

Histórico append-only de estado e mensagem pública segura. Cada transição grava
o pedido e seu evento na mesma transação; não recebe pacote exportado, e-mail,
token ou nota administrativa.

### `account_erasure_requests` — Workflow operacional de exclusão

Máquina de estados separada do protocolo público. Mantém confirmação verificada,
evidência hash, versão/claim CAS, lease, resultado por etapa e
`retention_until`. `operation_claim_session_id`, introduzido em
`20260729004000`, vincula toda mutação à sessão administrativa ativa.

Administradores autenticados podem inspecionar a fila, mas a migration
`20260729005000` remove INSERT/UPDATE direto do navegador: toda mutação é
service-write-only por Edge/RPC. A barreira privada
`kc_private.account_erasure_subject_closures` impede novos DSRs/exports depois
do primeiro claim irreversível.

**Ponte anônima 20260729012000:** o Help público de exclusão pode chegar sem
DSR. O wrapper service-only de vínculo adquire os locks de titular e Help,
revalida a sessão administrativa e o único Auth do e-mail e, somente quando há
zero DSR e o Help continua anônimo, cria exatamente um protocolo
`account_erasure` com `subject_hash` e idempotência aleatórios. Um DSR existente
é validado/reutilizado; mais de um, metadata forjada, outro fluxo aberto ou
estado avançado falham fechados. Materialização, eventos, workflow e ledger
compartilham a transação, sem folha privada executável diretamente por papel de
API.

### Exportação assistida privada *(20260728220000 / 20260729006000 / 20260729008000)*

| Tabela privada | Função |
|---|---|
| `kc_private.data_export_artifacts` | Metadados CAS do objeto temporário: referência `KEA-*`, bucket/path opacos, status, hashes, tamanho, leases, reserva de download e purge |
| `kc_private.data_export_processor_tasks` | Matriz de processadores automáticos/manuais; `manual_follow_up` bloqueia finalização sem evidência hash |
| `kc_private.data_export_media_refs` | Mapeia referências `KEM-*` para mídia de chat do próprio titular sem expor o caminho antes da reserva válida |
| `kc_private.data_export_ticket_identity_links` | Evidência imutável de que um Help anônimo foi verificado e ligado à DSR canônica |

`data_export_artifacts.status` admite `queued`, `claimed`, `ready`,
`download_reserved`, `delivered`, `failed`, `expired`, `purging` e `purged`.
`object_path` aceita somente `objects/{64 hex}.json`; `byte_size` é limitado a
16 MiB. A migration `20260729006000` adiciona `claimed_session_id`: o claim
administrativo registra `auth.sessions.id`, continuações token-bound revalidam
essa mesma sessão e o trigger limpa o vínculo quando o artefato deixa de estar
`claimed`.

A `20260729008000` acrescenta `download_return_status` e `delivery_count`. Um
artefato `delivered` pode receber nova reserva até `expires_at`; se a reserva
expirar, o trigger/reader restaura o estado terminal em vez de publicar um falso
`ready`. `data_export_processor_tasks` passa a guardar
`delivery_attested`, `delivery_channel` e `delivered_out_of_band_at`: esses
campos provam somente uma entrega separada, enquanto a projeção declara
`content_in_export=false`. A resolução de mídias fica limitada a 100 referências
por artefato. O claim de retenção comum usa `expires_at` também para artefatos
`delivered`, preservando a janela de novo download; somente o fluxo de exclusão
confirmada pode antecipar o expurgo coordenado. As reservas do titular falham
enquanto existir uma DSR de exclusão ativa, sem persistir ou devolver nova
capacidade.

Não há grants diretos dessas tabelas para `anon`/`authenticated`. Na fase
**expand**, as assinaturas administrativas vinculadas a
`p_actor_session_id` coexistem temporariamente com as assinaturas públicas
exigidas pela Edge anterior. Os cinco wrappers actor-only de compatibilidade
resolvem a sessão somente quando há exatamente uma sessão administrativa ativa;
zero ou mais de uma falham fechado. Os workers privados permanecem sem exposição
direta. A revogação dessas assinaturas públicas pertence a uma migration
**contract** posterior, depois de telemetria e ausência comprovada de
consumidores antigos.

Na aplicação da `06000`, um claim preexistente ainda vivo e com exatamente uma
sessão ativa recebe esse `claimed_session_id`. Qualquer claim remanescente sem
vínculo muda para `failed`, limpa a lease e recebe
`EXPORT_SESSION_BINDING_MIGRATION_RETRY`. Como proteção de corrida, a primeira
continuação de um claim pre-expand ainda sem sessão só pode vincular a sessão
única sob o mesmo artefato, versão, token, status e lease CAS.

### Retenção e comunicação privada LGPD

| Tabela privada | Função |
|---|---|
| `account_erasure_completion_outbox` | Destinatário cifrado em AES-256-GCM até aceite/TTL; ciphertext e nonce são nulificados após aceite |
| `account_erasure_completion_outbox_schedule_state` | Prova fail-closed do job horário de expurgo |
| `data_subject_request_retention_schedule_state` | Estado do job diário de minimização de protocolos |
| `data_export_retention_runs` | Execuções deduplicadas por nonce, sem PII/caminho de objeto |
| `data_export_retention_alerts` | Alertas duráveis por código e contagens |
| `data_export_retention_schedule_state` | Estado de Cron, pg_net, Vault, project-ref, jobs, sucessos e falhas |

O expurgo de artefato é Storage-first: o metadado só vira `purged` depois de
confirmar a ausência do objeto. Falhas permanecem retryable e visíveis.

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
post_votes_post_id_idx       ON post_votes(post_id)
post_votes_post_id_voter_id_key ON post_votes(post_id, voter_id)
post_votes_voter_id_idx      ON post_votes(voter_id)
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
notification_preferences_pkey  ON notification_preferences(user_id)         -- v11.20.1
notification_channel_targets_pkey ON notification_channel_targets(user_id, channel)  -- v11.21.1
idx_notification_delivery_outbox_channel_status ON notification_delivery_outbox(channel, status, next_attempt_at)  -- v11.20.2
idx_notification_delivery_outbox_status_next_attempt ON notification_delivery_outbox(status, next_attempt_at, created_at) WHERE status IN ('queued', 'failed', 'processing')  -- v11.20.2
idx_notification_delivery_outbox_user_created ON notification_delivery_outbox(user_id, created_at DESC)  -- v11.20.2
notification_delivery_outbox_notification_channel_uidx ON notification_delivery_outbox(notification_id, channel)  -- v11.20.2
idx_notification_delivery_attempts_outbox_attempted ON notification_delivery_attempts(outbox_id, attempted_at DESC)  -- v11.20.2
idx_notification_delivery_attempts_channel_status ON notification_delivery_attempts(channel, status, attempted_at DESC)  -- v11.20.2
idx_notification_dispatch_runs_created ON notification_dispatch_runs(created_at DESC)  -- v11.22.0
idx_notification_dispatch_runs_source_created ON notification_dispatch_runs(source, created_at DESC)  -- v11.22.0
idx_kc_invited_emails_invited_by ON kc_invited_emails(invited_by)          -- v9.3.3
idx_posts_fts                  ON posts USING GIN(kc_posts_search_document(title, description, category, metadata)) WHERE legacy_id IS NULL  -- v9.2.0
posts_metadata_gin_idx         ON posts USING GIN(metadata)
idx_post_view_events_dedup     ON post_view_events(post_id, user_id, created_at DESC) WHERE user_id IS NOT NULL  -- v9.3.1
idx_post_view_events_post_id   ON post_view_events(post_id)                          -- v9.3.1
idx_post_view_events_created_at ON post_view_events(created_at)                      -- v9.3.1
idx_post_view_events_user_id   ON post_view_events(user_id)                          -- v9.3.3
idx_posts_view_count           ON posts(view_count DESC) WHERE status = 'published'  -- v9.3.1
idx_chat_conv_low_lastmsg      ON chat_conversations(participant_low, last_message_at DESC NULLS LAST)
idx_chat_conv_high_lastmsg     ON chat_conversations(participant_high, last_message_at DESC NULLS LAST)
idx_chat_msg_conv_created      ON chat_messages(conversation_id, created_at DESC)
idx_chat_msg_sender_created    ON chat_messages(sender_id, created_at DESC)
user_blocks_active_pair_unique ON user_blocks(blocker_id, blocked_id)
user_blocks_subject_unique     ON user_blocks(blocker_id, blocked_subject_hash)
home_category_affinity_unique  ON home_category_affinity(owner_kind, owner_key, module_key, category_key)
post_engagement_rate_windows_pkey ON post_engagement_rate_windows(post_id, event_type, window_started_at)
post_engagement_rate_windows_prune_idx ON post_engagement_rate_windows(window_started_at)
data_subject_requests_owner_kind_idempotency_uidx ON data_subject_requests(user_id, request_kind, idempotency_key) WHERE user_id IS NOT NULL
data_subject_requests_owner_created_idx ON data_subject_requests(user_id, created_at DESC) WHERE user_id IS NOT NULL
data_subject_requests_admin_queue_idx ON data_subject_requests(request_kind, status, created_at)
data_subject_requests_expiry_idx ON data_subject_requests(expires_at) WHERE expires_at IS NOT NULL AND status = 'ready'
data_export_artifacts_queue_idx ON kc_private.data_export_artifacts(status, created_at)
data_export_artifacts_expiry_idx ON kc_private.data_export_artifacts(expires_at) WHERE status IN ('ready', 'download_reserved')
data_export_retention_runs_running_idx ON kc_private.data_export_retention_runs(started_at) WHERE status = 'running'
data_export_retention_alerts_active_idx ON kc_private.data_export_retention_alerts(last_seen_at DESC) WHERE active
```

**Paginação v9.2.2:** o feed incremental usa a RPC `kc_get_feed_cursor()` com cursor opaco. A ordenação preserva `bumped_at`, `last_comment_at` ou `highlight_score` conforme o tipo de feed.

**Filtros v9.2.1.1:** a RPC `kc_get_feed_cursor(..., p_request_params jsonb)` passou a aplicar server-side os filtros avançados já existentes de `compra-venda`, `caronas`, `moradia`, `oportunidades` e `achados-perdidos`, sem alterar a semântica pública do cursor.

**Faixas numéricas v9.2.1.2:** `kc_get_feed_cursor()` passou a aceitar `priceMin` e `priceMax` dentro de `p_request_params`, aplicando o intervalo diretamente sobre `posts.price` e normalizando limites invertidos no banco.

**Presets de data v9.2.1.3:** `kc_get_feed_cursor()` passou a aceitar `datePreset` dentro de `p_request_params`, aplicando server-side a mesma semântica do client em `America/Sao_Paulo`. `eventos` usa `metadata.data_evento` / `metadata.data` com fallback para `created_at`; os demais módulos usam recência por `created_at`.

**Busca v9.2.0:** a busca server-side usa `kc_search_posts_fts()` com `unaccent + portuguese`, expansão de sinônimos no client e documento ponderado por `title`, `tags`, `description`, `category` e `subcategory`.

**Hardening v9.2.3:** os helpers de feed e busca sinalizados pelo Security Advisor agora fixam `SET search_path = ''` e usam referencias qualificadas, removendo os warnings `function_search_path_mutable` sem alterar contratos publicos. A extensao de `v9.2.1.3` manteve esse mesmo padrao para `kc_get_feed_cursor()` e os novos helpers de data. Permanecem pendentes e separados desta iteracao: `extension_in_public` para `unaccent` e `auth_leaked_password_protection`.

**Analytics de post v9.3.1:** `posts.view_count` armazena contagem denormalizada de visualizacoes. `post_view_events` registra eventos granulares com anti-spam (1 view/usuario/post/hora). Self-views (autor vendo proprio post) nao contam. Retencao: 6 meses via `kc_prune_old_analytics()`. RPCs: `kc_track_view(p_post_id)` para registrar, `kc_get_post_analytics(p_post_id)` para metricas (autor-only).

**Reputacao v9.1.2.0:** a fundacao de `user_ratings` adiciona agregados em `profiles`, triggers de sincronizacao e RPCs dedicadas com `SET search_path = ''`. A elegibilidade usa apenas interacoes persistidas (`comments`, `post_votes`, `saved_posts`) e a identidade do avaliador pode ser anonimizada nas listagens publicas.

**Hardening de autorização 20260728234000:** remove grants implícitos de `PUBLIC`, separa funções trigger-only/service-only, vincula limites de post ao próprio usuário, fecha leituras administrativas de banners, aplica privacidade a ratings/perfis e unifica a visibilidade de categorias/engajamento com `kc_can_read_post`. Afinidade server-side passa a ser somente do titular autenticado e consentido.

**Reconciliação 20260728235000:** restaura 13 folhas privadas omitidas pela baseline para ads, tabs, chat e reativação de post; restringe wrappers de chat a `authenticated`; remove `anon` das ações autenticadas de post; recompõe os triggers de preview do chat e impede reativação de conteúdo cujo autor já foi apagado.

**Arquivamento seguro de conversa 20260729000000:** substitui o `UPDATE` amplo de participante por uma RPC vinculada a `auth.uid()` e à sessão ativa, remove a policy permissiva e preserva as colunas de participantes e preview como estado exclusivamente server-side.

**Reconciliação dos guards 20260729001000:** reexecuta o instalador canônico de proteção contra JWT revogado sobre todas as tabelas públicas atuais e interrompe a migration se trigger, policy restritiva, hook do PostgREST ou policy do Storage permanecerem incompletos. Isso restaura `write_quiescence=true` sem ampliar privilégios de tabela.

### `kc_invited_emails` - Convites Externos Administrativos (v9.1.0.3)

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `email` | TEXT PK | E-mail do convidado, normalizado em minusculas |
| `invited_by` | UUID FK profiles(id) ON DELETE SET NULL | Admin responsavel pelo convite |
| `note` | TEXT | Observacao interna opcional |
| `invited_at` | TIMESTAMPTZ | Momento do convite |
| `used_at` | TIMESTAMPTZ | Preenchido apos onboarding concluido |
| `expires_at` | TIMESTAMPTZ | Expiracao padrao de 7 dias |

**RLS:** SELECT para admin ou para o proprio e-mail autenticado; INSERT/UPDATE/DELETE admin-only.
**Operacao associada:** usada pela Edge Function `kc-invite-user` e pelas RPCs administrativas de listagem/revogacao.

**Operacional v9.3.3 / v11.19.0:** `notifications`, `post_view_events` e `kc_invited_emails` tiveram RLS otimizado para o Advisor do Supabase com `initplan` (`(select auth.uid())`), consolidacao das policies SELECT permissivas redundantes e cobertura de FK por indice em `kc_invited_emails.invited_by` e `post_view_events.user_id`. Permanecem fora desta migration e sob trilha operacional separada: `extension_in_public` para `unaccent` e `auth_leaked_password_protection`.

## Storage Buckets

| Bucket | Visibilidade e limite | Caminho/uso | Autorização |
|---|---|---|---|
| `kino-media` | público para leitura | `profile-avatars/{userId}/...` e `post-media/{userId}/{postId}/...` | escrita autenticada nos caminhos validados; alteração e exclusão limitadas ao proprietário |
| `kino-chat-media` | privado; 15 MiB; imagens, áudio, PDF e DOC/DOCX permitidos | `chat-media/{conversationId}/{senderId}/{filename}` | leitura somente pelos participantes da conversa; criação, alteração e exclusão somente pelo remetente participante, sempre com sessão ativa |
| `kino-data-exports` | privado; 16 MiB; somente `application/json` | `objects/{sha256-aleatório}.json` para complementos temporários | nenhuma policy de acesso direto pelo navegador; somente Edge Functions com sessão/titularidade revalidadas e `service_role` acessam o objeto |

O bucket público não deve receber novos anexos de chat. A policy temporária no
prefixo legado existe apenas para a limpeza pelo remetente durante o cutover e
deve ser removida depois da cópia, validação SHA-256 e retirada dos objetos
legados. Uma policy `RESTRICTIVE` global também exige sessão ativa para qualquer
acesso autenticado ao Storage; `kino-data-exports` possui negação adicional
explícita para `anon` e `authenticated`.

## pg_cron Jobs

Esta é a configuração versionada/esperada. Estado remoto deve ser verificado em
`cron.job` e, para os fluxos LGPD, nas respectivas tabelas privadas de
`schedule_state`; a presença da migration no repositório não comprova que o job
está ativo.

| Job | Schedule | Operação |
|---|---|---|
| `kc-expire-old-posts` | `0 3 * * *` | `public.kc_expire_old_posts()` |
| `kc-prune-analytics` | `0 4 1 * *` | Retenção mensal de busca, audit log e views |
| `kc-prune-notifications` | `0 5 1 * *` | Notificações lidas com mais de 90 dias |
| `kc-dispatch-notification-outbox` | `*/5 * * * *` | Dispatch externo via runtime privado/pg_net |
| `kc-refresh-highlight-scores` | `15 */6 * * *` | Recalcula scores do feed |
| `kc-dsr-retention-purge-daily` | `17 3 * * *` | `kc_purge_expired_data_subject_requests(500)` |
| `kc-help-notification-claim-purge-daily` | `41 3 * * *` | `kc_purge_help_request_notification_claims(500)` |
| `kc-erasure-completion-outbox-purge-hourly` | `11 * * * *` | `kc_purge_expired_account_erasure_completion_outbox(500)` |
| `kc-data-export-retention-purge` | `*/15 * * * *` | Dispara lote de até 50 no worker Storage-first |
| `kc-data-export-retention-monitor` | `7 * * * *` | Monitora jobs, backlog, falhas e sucesso recente |

Os três primeiros jobs de privacidade usam rotina SQL local. O purge de
artefatos assistidos usa `pg_cron` + `pg_net` + Vault e permanece
`scheduled=false` quando extensão, isolamento, endpoint, project-ref ou segredo
não passam no preflight.
