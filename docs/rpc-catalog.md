# KinoCampus — Catálogo de RPCs e Funções do Banco

## Convenções

- Funções e RPCs fixam explicitamente o `search_path`; o padrão atual para `SECURITY DEFINER` é `SET search_path = ''` com todas as referências qualificadas.
- O prefixo `kc_` identifica funções do KinoCampus, mas não significa exposição pública. A API fica em `public`; implementações privilegiadas e helpers trigger-only ficam em `kc_private`.
- Wrappers `SECURITY INVOKER` em `public` preservam o contrato do cliente e delegam para um worker privado com validações de identidade, ownership, consentimento e visibilidade.
- Um `GRANT EXECUTE` no worker de `kc_private` pode ser necessário para o wrapper invoker funcionar. Isso não transforma o worker em RPC REST, pois `kc_private` não é schema exposto pelo PostgREST.
- Triggers são prefixados com `kc_handle_` ou `kc_set_`
- RPCs chamados via `supabase.rpc('nome_funcao', params)`

### Matriz de exposição vigente *(20260728234000 a 20260729006000)*

| Superfície | `anon` | `authenticated` | `service_role` | Regra adicional |
|---|---:|---:|---:|---|
| `kc_get_feed_ad_config`, `kc_get_personalized_tabs` | EXECUTE | EXECUTE | EXECUTE | Retorno público minimizado; personalização anônima é somente agregada |
| `kc_get_user_rating_summary`, `kc_get_profile_access_state`, `kc_home_category_post_counts` | EXECUTE | EXECUTE | EXECUTE | Privacidade de perfil e visibilidade de post são aplicadas dentro da função |
| `kc_track_coupon_click`, `kc_track_share` | EXECUTE | EXECUTE | EXECUTE | Apenas post publicado e visível; janela diária por post/evento |
| Wrappers `kc_chat_*` de uso do cliente | — | EXECUTE | — | Exigem participante/remetente/owner conforme a operação |
| `kc_track_home_category_affinity`, `kc_list_home_category_affinity`, `kc_merge_home_category_affinity` | — | EXECUTE | — | Titular autenticado e consentimento de analytics verificável |
| `kc_create_data_subject_request_v2`, `kc_cancel_data_subject_request` | — | EXECUTE | — | Identidade derivada da sessão ativa; idempotência e barreira de exclusão no banco |
| RPCs de entrega/continuação de exportação LGPD | — | — | EXECUTE | A Edge revalida titular e sessão; download é ligado a `user_id` + `auth.sessions.id` |
| RPCs administrativas de exportação/exclusão | — | — | EXECUTE | As assinaturas preferenciais exigem `p_actor_id` + `p_actor_session_id`; cinco wrappers actor-only coexistem no expand somente com uma sessão ativa inequívoca, sem reabrir workers privados |
| `kc_bump_post`, `kc_check_post_flood_limit`, `kc_close_post`, `kc_get_post_flood_limit`, `kc_reactivate_post`, `kc_record_post_audit_event`, `kc_renew_post`, `kc_toggle_post_status` | — | EXECUTE | EXECUTE | Ownership ou autorização administrativa é validada no worker |
| `kc_admin_list_banners`, `kc_admin_banner_audit` | — | EXECUTE | EXECUTE | O grant não substitui `kc_is_admin`; caller autenticado não-admin falha com `insufficient_privilege` |
| Funções de trigger e helpers internos endurecidos | — | — | Somente quando explicitamente necessário | Execução automática por trigger não depende de exposição como RPC |

Todos os itens da tabela acima têm `REVOKE ALL ... FROM public, anon, authenticated, service_role` antes dos grants positivos. Assim, não há permissão herdada de `PUBLIC` ampliando silenciosamente a superfície.

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

### `kc_get_feed_ad_config(p_page_path text default '/', p_module_key text default '', p_placement text default null) → JSONB` *(20260728235000)*

Entrega somente a configuração necessária para renderizar anúncios no feed. O worker privado não devolve campos administrativos como `notes` ou `updated_by`.

**Retorno ativo:** `{ "ok": true, "enabled": true, "provider": "...", "status": "active", "adsense_client_id": "...", "auto_ads_enabled": false, "placement_modes": {...}, "adsense_slots": {...} }`.

**Fail closed:**

- configuração ausente ou inativa → `enabled=false`, `reason=disabled`;
- páginas de conta, autenticação, administração, mensagens, ajuda e documentos legais → `enabled=false`, `reason=blocked_page`;
- `p_placement` limita o mapa retornado ao slot solicitado; não concede acesso a configuração interna.

**Exposição:** wrapper e worker executáveis por `anon`, `authenticated` e `service_role`; o worker existe em `kc_private` apenas para suportar o wrapper invoker.

---

### `kc_get_personalized_tabs(p_session_id text default null, p_limit integer default 8) → TABLE` *(20260728235000)*

Retorna até `30` pares normalizados de módulo/categoria, com score composto por afinidade, destaque, recência e volume.

**Limites de visibilidade:**

- `anon`: considera somente posts `published` com `visibility='public'`;
- `authenticated`: pode considerar `public` e `community`;
- admin ou `service_role`: pode considerar todo post publicado;
- uma categoria só aparece se houver post recente e visível que a sustente.

**Privacidade:** `p_session_id` nunca autoriza leitura de afinidade por si só. Afinidade persistida entra no score apenas quando o caller está autenticado, a linha pertence ao próprio `auth.uid()` (`owner_kind='user'`) e `kc_home_user_has_analytics_consent(...)` encontra consentimento afirmativo para a sessão. Para `anon` ou sem consentimento, o resultado é um fallback agregado e não personalizado.

**Exposição:** `anon`, `authenticated` e `service_role`.

---

### Afinidade da homepage *(20260728234000)*

| RPC | Retorno | Contrato atual |
|---|---|---|
| `kc_track_home_category_affinity(p_session_id text, p_events jsonb)` | `integer` | Processa no máximo 50 eventos, somente para o próprio usuário autenticado e consentido; normaliza chaves e limita cada delta a `0.5..50` |
| `kc_list_home_category_affinity(p_session_id text, p_limit integer, p_offset integer)` | `TABLE` | Lista somente linhas `owner_kind='user'` do próprio `auth.uid()`; limite máximo 100 |
| `kc_merge_home_category_affinity(p_session_id text)` | `integer` | Compatibilidade sem efeito; retorna `0`, pois afinidade anônima server-side foi aposentada |

As três RPCs são `authenticated`-only. Linhas legadas `owner_kind='session'` são removidas pela migration; eventos anônimos ficam no navegador até haver autenticação e consentimento. O identificador de sessão é usado somente para localizar o evento de consentimento por SHA-256 e não é persistido na afinidade do usuário.

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
- Perfil público mantém o resumo disponível para todos. Perfil não público retorna o envelope neutro `{ average: null, count: 0 }` para caller não relacionado; somente o próprio titular, admin ou `service_role` recebe os agregados reais.
- `EXECUTE` permanece para `anon`, `authenticated` e `service_role`, porque a privacidade é aplicada dentro da função sem revelar se um perfil privado existe.

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
- É `authenticated`-only na API. Antes de revelar `myRating`, existência do alvo ou elegibilidade, aplica a privacidade do perfil alvo e `kc_can_read_post(...)` ao post de contexto e às interações persistidas.
- Perfil privado não relacionado é indistinguível de perfil ausente (`TARGET_NOT_FOUND`); contexto invisível retorna `INVALID_CONTEXT`.

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

### `kc_reactivate_post(p_post_id uuid) → JSONB` *(20260728235000)*

Reativa exclusivamente um post em estado `closed`, preservando o envelope público legado.

**Segurança e concorrência:**

- exige dono, admin ou `service_role`; caller comum não pode operar sobre post alheio;
- bloqueia a linha do post e usa advisory lock por autor/módulo antes de verificar o limite de posts ativos;
- o limite é consultado por `kc_check_post_limit`, que desde `20260728234000` impede caller comum de consultar outro usuário;
- admin/service podem executar override administrativo, mas nem automação privilegiada reativa conteúdo cujo `author_id` foi apagado;
- reativação usa `7` dias para `caronas` e `30` para os demais módulos quando a expiração anterior já venceu;
- remove metadados de fechamento, registra metadados de reativação e escreve `post_reactivated` no audit log.

**Retornos relevantes:** `AUTH_REQUIRED`, `POST_NOT_FOUND`, `FORBIDDEN`, `AUTHOR_DELETED`, `INVALID_STATUS`, `ALREADY_ACTIVE` ou `{ "ok": true, "status": "published", "new_status": "published", "expires_at": "..." }`.

**Exposição:** `authenticated` e `service_role`; sem `anon`.

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

**Exposição:** somente `service_role`; a função não é RPC de usuário.

---

### `kc_check_post_limit(p_user_id uuid, p_module text) → JSONB`

Verifica se usuário pode criar/renovar post no módulo.

**Chamado internamente em:** `kc_renew_post`, `kc_toggle_post_status`, `supabase.adapter.js` no create.

**Retorno:** `{ "ok": true, "count": 2, "limit": 5, "remaining": 3 }` ou `{ "ok": false, "count": 5, "limit": 5, "remaining": 0 }`.

**Hardening 20260728234000:** `p_user_id=NULL` resolve para o próprio `auth.uid()`. Um usuário comum só consulta a própria contagem/limite; alvo diferente exige admin, e `anon` recebe `AUTH_REQUIRED`. `EXECUTE` existe apenas para `authenticated` e `service_role`.

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

### `kc_track_share(p_post_id uuid)` / `kc_track_coupon_click(p_post_id uuid) → JSONB` *(20260728234000)*

Incrementam os contadores públicos de compartilhamento e clique no CTA sem persistir identidade, IP, dispositivo ou sessão do caller.

**Visibilidade:** o post precisa estar `published` e ser legível pelo caller via `kc_can_read_post(...)`. Um post inexistente ou invisível retorna `NOT_FOUND`, evitando confirmar conteúdo fora da fronteira de leitura.

**Rate windows por dia UTC:**

| Evento | Limite por post/dia |
|---|---:|
| `share` | 25 |
| `coupon_click` | 50 |

O helper privado `kc_claim_post_engagement_slot(uuid, text, integer)` faz `UPSERT` atômico em `post_engagement_rate_windows`. Ao esgotar a janela, a RPC continua idempotente para o cliente e retorna `{ "ok": true, "code": "RATE_LIMITED", "counted": false }`; o contador do post não é incrementado. Janelas com mais de 30 dias são podadas oportunisticamente.

**Exposição:** `anon`, `authenticated` e `service_role`. A tabela e o helper de claim não são acessíveis ao cliente.

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

### `kc_get_profile_access_state(p_profile_id uuid) → TABLE` *(20260728234000)*

Retorna `(exists, profile_public)` sem transformar perfil privado em oráculo de existência. Para caller não relacionado, perfil privado e perfil ausente produzem `(false, false)`; titular, admin e `service_role` mantêm o diagnóstico real.

**Exposição:** `anon`, `authenticated` e `service_role`.

### `kc_home_category_post_counts() → TABLE` *(20260728234000)*

Conta categorias somente sobre posts `published` dentro da mesma fronteira de visibilidade do feed: `anon` vê `public`; autenticado pode ver `public` e `community`; `service_role` preserva leitura operacional. O matching continua centralizado em `kc_home_match_category(...)`.

**Exposição:** `anon`, `authenticated` e `service_role`.

---

### `kc_ingest_search_queries(p_session_id text, p_entries jsonb) → JSONB` *(20260714121506)*

Ingere um lote consentido de buscas internas. A RPC define IDs e timestamps no servidor, persiste somente hash SHA-256 da sessão, mantém `user_id` nulo e rejeita PII, URL, credencial, controle, lote inválido, duplicata curta e excesso por sessão.

**Chamado em:** `kc-search.js`; EXECUTE para `anon` e `authenticated`, sem INSERT direto na tabela.

### `kc_admin_search_trends(...)` / `kc_admin_search_trends_classified(...)`

Retornam termos agregados exclusivamente depois de validar `kc_is_admin(auth.uid())` dentro da função. Os workers privados não são executáveis por clientes.

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

## Direitos do titular e exportação LGPD *(20260728183022 a 20260729012000)*

As RPCs abaixo são fachadas; o navegador não recebe `service_role`. A Edge
Function valida o JWT, confirma a sessão em `auth.sessions` e só então usa as
assinaturas privilegiadas. Protocolo público, referência de Help, artefato e
claim são identificadores distintos.

### Entrada do titular

| RPC | Papel | Contrato |
|---|---|---|
| `kc_create_data_subject_request_v2(p_request_kind text, p_idempotency_key text, p_requested_format text, p_request_source text)` | `authenticated` | Cria/reutiliza DSR e Help canônicos sob lock; identidade vem de `auth.uid()` |
| `kc_create_help_request_with_notification_claim_v2(p_payload jsonb)` | `anon`, `authenticated`, `service_role` | Cria Help e, quando cabível, DSR sob o estado Auth esperado; rejeita troca visitante↔conta ou conta A↔B antes de qualquer gravação |
| `kc_cancel_data_subject_request(p_protocol text)` | `authenticated` | Cancela somente pedido próprio ainda reversível |
| `kc_is_current_session_active()` | `authenticated` | Confirma existência da sessão corrente; não substitui autorização da operação |

`kc_create_data_subject_request_v2` retorna o pedido aberto canônico compatível
quando há retry ou perda da chave local. `account_erasure` também respeita a
barreira durável de fechamento do titular.

O criador do formulário recebe `expected_auth_state` (`anonymous` ou
`authenticated`) e `expected_user_id` para a conta autenticada. A validação
ocorre no wrapper privado antes da chamada ao corpo legado. Sem estado explícito,
somente o modo ainda anônimo é aceito; o formato legado com
`expected_user_id` é interpretado como autenticado para permitir rollout
backend-first. Usuários anônimos do Supabase que possuam `auth.uid()` continuam
com `help_requests.user_id = null` até a vinculação de identidade auditada.

### Vínculo verificado de exclusão anônima

`kc_link_verified_help_request_to_account_erasure(help_request_id,
account_email, actor_id, actor_session_id, verification_channel,
attestation_sha256, verified_at) → JSONB` é service-only. O wrapper valida a
prova administrativa e executa, na mesma transação, duas folhas sem grant
direto em `kc_private`:

1. se o Help anônimo não tiver DSR, materializa exatamente um
   `account_erasure` com protocolo, token de titular e chave idempotente
   aleatórios definidos no banco, além do evento público `created`;
2. valida/reutiliza o único DSR, vincula Help, workflow, ledger imutável e
   evento de identidade.

Mais de um DSR, `metadata.data_subject_request_id` sem relação real, outro fluxo
de exclusão aberto, fechamento irreversível, sessão inativa ou workflow
avançado falham fechados. A exceção desfaz inclusive o DSR recém-materializado;
dados do navegador não escolhem titular, identificadores, escopo ou estado.

### Entrega direta e suplemento do titular

| RPC service-only | Contrato |
|---|---|
| `kc_transition_data_subject_request_for_active_session(uuid,text,text,uuid,uuid,text,text)` | Transição CAS ligada ao titular e à sessão ativa |
| `kc_reserve_data_subject_download(...)` | Reserva curta do JSON direto |
| `kc_enqueue_data_export_artifact(uuid,uuid,jsonb)` | Enfileira/reutiliza metadado privado do suplemento |
| `kc_read_data_export_artifact_for_owner(uuid,uuid)` | Projeção mínima do artefato para o próprio titular |
| `kc_reserve_data_export_artifact_download(text,bigint,uuid,uuid,integer)` | Reserva de download por usuário, sessão, versão e token hash |
| `kc_read_data_export_media_refs_for_download(text,bigint,uuid,uuid,text)` | Resolve mídia própria somente durante reserva válida |
| `kc_consume_data_export_artifact_download(text,bigint,uuid,uuid,text,text,bigint)` | Confirma hash/tamanho e conclui DSR/Help atomicamente |

Limites do runtime versionado:

| Caminho | Linhas | Bytes/janela |
|---|---|---|
| Direto | 2.500 por categoria; 25.000 de origem; até 100 mídias de chat | 3 MiB de origem, 8 MiB finais, janela de 15 min, URL de mídia por até 10 min |
| Assistido | 10.000 por categoria; 100.000 de origem; até 100 mídias | 12 MiB de origem, 16 MiB finais, artefato pronto/baixável novamente por até 7 dias; URLs de mídia por até 10 min |
| Retenção | até 100 artefatos por chamada | corpo de 1 KiB, assinatura por 120 s, até 3 tentativas de remoção |

Exceder qualquer limite deixa a categoria explícita no manifesto e mantém o
atendimento aberto; não autoriza truncamento silencioso nem aumento improvisado
do bucket.

### Exportação administrativa vinculada à sessão *(20260729006000)*

As operações que iniciam ou inspecionam trabalho recebem a sessão
administrativa explicitamente:

| RPC | Assinatura relevante |
|---|---|
| `kc_admin_read_data_export_artifact` | `(help_request_id, artifact_ref, actor_id, actor_session_id)` |
| `kc_record_data_export_processor_evidence` | overload endurecido `(artifact_ref, expected_version, actor_id, actor_session_id, processor, outcome, evidence_reference, delivery_attested, delivery_channel, delivered_out_of_band_at)` |
| `kc_link_verified_help_request_to_data_export` | `(help_request_id, account_email, request_kind, actor_id, actor_session_id, verification_channel, attestation_sha256, verified_at, processors)` |
| `kc_recover_expired_data_export_artifact` | `(artifact_ref, expected_version, actor_id, actor_session_id, ttl_seconds)` |
| `kc_claim_data_export_artifact` | `(artifact_ref, expected_version, actor_id, actor_session_id, lease_seconds)` |
| `kc_claim_expired_data_export_artifacts` | overload administrativo `(limit, actor_id, actor_session_id)`; máquina usa `actor_id = null` |
| `kc_claim_data_export_artifact_purge` / `kc_purge_data_export_artifact` | overload administrativo inclui `actor_session_id`; máquina não pode simular ator |

O claim novo persiste `claimed_session_id` no artefato. As continuações
`kc_store_data_export_media_refs`, `kc_authorize_data_export_artifact_upload`,
`kc_finalize_data_export_artifact` e `kc_fail_data_export_artifact` obtêm
ator/sessão desse claim e revalidam ambos antes da mutação.

A `20260729006000` e a `20260729008000` são migrations **expand**: as novas assinaturas session-bound
coexistem temporariamente com cinco wrappers públicos actor-only usados pela Edge
anterior: leitura administrativa, evidência, vínculo de Help, recovery e claim.
Cada wrapper resolve a sessão apenas se o administrador tiver exatamente uma
sessão ativa e não expirada; nenhuma ou múltiplas sessões produzem erro
fail-closed. Os workers de `kc_private` continuam sem exposição direta.

A `08000` restaura também as três formas actor-only de retenção/purge durante a
janela expand; ator nulo continua sendo exclusivamente máquina, e ator presente
é encaminhado ao overload session-bound somente após resolver exatamente uma
sessão ativa. O resultado `supplied` antigo passa a falhar: entrega externa usa
`supplied_out_of_band`, atestação, canal e horário. Nenhum conteúdo externo é
aceito pelo RPC ou incluído implicitamente no JSON; a referência operacional é
guardada somente como hash contextualizado pelo artefato e processador.

Na entrega ao titular, `ready` e `delivered` podem ser reservados até
`expires_at`. A sessão é conferida em `auth.sessions` com o `session_id` exato e
`not_after` ainda válido, antes da reserva e novamente no consume. Uma DSR de
exclusão ativa torna a entrega inelegível; para retomá-la, o titular cancela a
exclusão enquanto reversível e atualiza/reabre a cópia. A retenção automática
comum não reivindica `delivered` antes de `expires_at`, preservando o contrato de
novo download. O claim de exclusão confirmado continua sendo a exceção que
expurga os artefatos antes da remoção da conta.

Claims que já estavam `claimed` quando a migration começou recebem a única sessão
ativa apenas se a lease ainda estiver válida. Os demais claims sem sessão são
liberados para `failed`, com incremento de versão e
`EXPORT_SESSION_BINDING_MIGRATION_RETRY`. Uma continuação que concorra com esse
backfill só pode vincular a sessão única sob CAS do mesmo artefato, versão, token,
status e lease. `kc_fail_data_export_artifact` permanece uma saída de abandono
session-independent: ele pode mover o claim para falha, mas nunca autoriza
conteúdo, upload, finalize ou purge.

A revogação dos cinco wrappers públicos actor-only é **contract diferido** e
requer Edge nova estável, canários aprovados e telemetria demonstrando ausência
de consumidores antigos. Os overloads de purge com ator continuam exigindo
sessão; a forma com ator nulo é reservada ao worker máquina-a-máquina.

### Exclusão e retenção

| RPC service-only | Contrato |
|---|---|
| `kc_upsert_account_erasure_workflow(..., actor_id, actor_session_id, ...)` | Cria/reutiliza workflow canônico com sessão administrativa ativa |
| `kc_claim_account_erasure_operation(..., actor_id, actor_session_id, lease_seconds)` | Claim reversível CAS |
| `kc_claim_account_erasure_irreversible_operation(...)` | Cria a barreira durável antes da primeira mutação irreversível |
| `kc_renew_account_erasure_operation(request_id, claim_token, expected_version, actor_id, actor_session_id, ttl_seconds)` | Heartbeat somente para a mesma lease/sessão ainda ativa |
| `kc_transition_data_subject_request_for_admin_session(...)` | Transição DSR por administrador vinculado à sessão |
| `kc_account_erasure_capabilities()` | Capability fail-closed do schema/guards/outbox/export purge |
| `kc_begin_data_export_retention_run(...)` / `kc_finish_data_export_retention_run(...)` | Execução M2M deduplicada por nonce, sem PII |

Funções `kc_configure_data_export_retention_schedule`,
`kc_trigger_data_export_retention` e `kc_monitor_data_export_retention` ficam em
`kc_private` e são operadas pelo banco, não pela Data API do navegador.

---

## Chat privado *(reconciliado em 20260728235000 e endurecido em 20260729000000)*

Todos os wrappers de cliente abaixo são `authenticated`-only. Eles são `SECURITY INVOKER` e delegam para folhas `SECURITY DEFINER` em `kc_private`; `anon`, `PUBLIC` e `service_role` não têm `EXECUTE` nesses endpoints de usuário.

| RPC pública | Resultado | Proteção principal |
|---|---|---|
| `kc_chat_start_conversation(p_other_user_id uuid)` | `(out_conversation_id, out_is_new)` | Perfil alvo existente, sem autochat, bloqueio bidirecional, par idempotente |
| `kc_chat_block_user(p_other_user_id uuid, p_reason text)` | `void` | Titular do bloqueio, alvo existente, razão até 500 caracteres |
| `kc_chat_unblock_user(p_other_user_id uuid)` | `void` | Remove somente bloqueio criado pelo caller |
| `kc_chat_is_blocked(p_other_user_id uuid)` | `(out_i_blocked, out_they_blocked)` | Consulta sempre relativa ao próprio `auth.uid()` |
| `kc_chat_list_conversations(p_limit integer, p_before timestamptz)` | `TABLE` | Somente conversas em que o caller é participante; limite `1..100` |
| `kc_chat_list_messages(p_conversation_id uuid, p_limit integer, p_before_ts timestamptz)` | `TABLE` | Somente participante da conversa |
| `kc_chat_send_message(p_conversation_id uuid, p_content text, p_message_type text, p_media_path text)` | `(out_message_id, out_created_at)` | Participante, conversa ainda aberta, bloqueio bidirecional, tipo/path/rate limit |
| `kc_chat_mark_read(p_conversation_id uuid, p_until_message_id uuid)` | `void` | Participante; o marcador deve pertencer à mesma conversa; estado monotônico |
| `kc_chat_unread_total()` | `(out_total)` | Conta somente mensagens recebidas nas conversas do caller |
| `kc_chat_edit_message(p_message_id uuid, p_new_content text)` | `void` | Somente remetente, texto não apagado, até 4000 caracteres e janela de 24 h |
| `kc_chat_delete_message(p_message_id uuid)` | `(out_media_path)` | Somente remetente; soft-delete limpa `content` e `media_path` |
| `kc_chat_report_message(p_message_id uuid, p_reason text, p_details text)` | `void` | Participante só denuncia mensagem do outro participante |
| `kc_chat_set_conversation_archived(p_conversation_id uuid, p_archived boolean)` | `JSONB` | Sessão ativa e participante; muda somente o flag de arquivamento do próprio lado |
| `kc_chat_set_message_reply(p_message_id uuid, p_reply_to_id uuid)` | `JSONB` | Worker privado preexistente, limitado à mesma conversa |
| `kc_chat_toggle_reaction(p_message_id uuid, p_emoji text)` | `JSONB` | Worker privado preexistente, limitado ao participante |

`block`, `unblock` e `start_conversation` usam o mesmo advisory lock por par ordenado de usuários. Assim, a verificação de bloqueio e a criação/retomada da conversa não competem em uma janela de corrida. Conversa preservada após exclusão de uma conta continua listável para o participante remanescente com nome neutro `Conta excluida`.

`kc_chat_send_message` mantém a janela móvel de um minuto do worker preexistente: até 5 mensagens para conta com menos de 7 dias e até 30 para as demais. Mídia precisa ficar sob `chat-media/{conversation_id}/{auth.uid()}/...`, impedindo referência ao objeto de outro remetente.

### Arquivamento por participante

`kc_chat_set_conversation_archived(p_conversation_id uuid, p_archived boolean) → JSONB` retorna `{ "ok": true, "conversation_id": "...", "archived": true|false }`. O worker valida `auth.uid()`, sessão ativa, UUID, boolean e participação; bloqueia a conversa durante a transição e atualiza exclusivamente `archived_by_low` ou `archived_by_high`. Conversa ausente e conversa de outro usuário produzem o mesmo `conversation_not_found`, evitando um oráculo de existência.

A migration `20260729000000_secure_chat_conversation_archive_rpc.sql` está em
fase **expand**: a RPC é o contrato preferencial, enquanto o `UPDATE` legado
permanece temporariamente para `authenticated`. A policy exige sessão ativa e
participação, e o trigger `kc_guard_legacy_chat_archive_update` compara `OLD` e
`NEW`, permitindo apenas o flag de arquivamento do próprio lado. Participantes,
preview e o flag do outro lado continuam exclusivamente server-side.
`PUBLIC`/`anon` não recebem `UPDATE`; `service_role` conserva o acesso interno e
não recebe `EXECUTE` na RPC de usuário.

A fase **contract** que removerá o grant/policy/trigger de compatibilidade é
diferida para uma migration posterior, depois da publicação e verificação dos
consumidores da RPC. Não antecipe essa remoção no rollout expand.

### Preview denormalizado do chat

Os helpers trigger-only `kc_chat_refresh_conversation_preview(uuid, boolean)`, `kc_chat_after_message_insert()` e `kc_chat_after_message_update()` ficam em `kc_private`, com execução direta revogada de todos os papéis de API.

- `AFTER INSERT` recalcula `chat_conversations.last_message_*` e reabre a conversa para os dois participantes;
- `AFTER UPDATE OF content, media_path, edited_at, deleted_at` busca novamente a mensagem não apagada mais recente;
- a ordenação usa `(created_at DESC, id DESC)` e bloqueia a linha da conversa para serializar o refresh;
- apagar a última mensagem remove seu plaintext do preview e volta para a mensagem não apagada anterior; se nenhuma restar, zera todos os campos `last_message_*`;
- o preview continua limitado a 120 caracteres; mídia sem legenda usa marcador neutro por tipo.

O trigger `kc_chat_mark_messages_read()` também não é RPC de cliente: `EXECUTE` direto fica somente com `service_role`, e a atualização de checkmarks ocorre automaticamente após a validação de `kc_chat_mark_read`.

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
- aguarda por até 30 segundos a resposta assíncrona registrada pelo `pg_net`
- permite execução apenas por `service_role`; usuários `anon` e `authenticated` não podem iniciar o dispatch

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

## Workers privados reconciliados *(20260728235000 / 20260729000000)*

A baseline consolidada preservava wrappers públicos cujas folhas privadas haviam sido omitidas. A migration `20260728235000_reconcile_missing_private_rpc_workers.sql` recompõe os contratos sem tornar `kc_private` um schema de API:

| Wrapper em `public` | Worker em `kc_private` | Exposição efetiva |
|---|---|---|
| `kc_get_feed_ad_config(text,text,text)` | mesmo nome/assinatura | público seguro (`anon`, `authenticated`, `service_role`) |
| `kc_get_personalized_tabs(text,integer)` | mesmo nome/assinatura | público com fallback por papel e consentimento |
| `kc_chat_block_user`, `kc_chat_unblock_user`, `kc_chat_is_blocked` | mesmos nomes/assinaturas | `authenticated`-only |
| `kc_chat_start_conversation`, `kc_chat_list_conversations` | mesmos nomes/assinaturas | `authenticated`-only |
| `kc_chat_mark_read`, `kc_chat_unread_total` | mesmos nomes/assinaturas | `authenticated`-only |
| `kc_chat_delete_message`, `kc_chat_edit_message`, `kc_chat_report_message` | mesmos nomes/assinaturas | `authenticated`-only |
| `kc_chat_set_conversation_archived(uuid,boolean)` | mesmo nome/assinatura | `authenticated`-only; sessão ativa e flag do próprio lado |
| `kc_reactivate_post(uuid)` | mesmo nome/assinatura | `authenticated`, `service_role` |

As folhas preexistentes de `kc_chat_list_messages`, `kc_chat_send_message`, `kc_chat_set_message_reply` e `kc_chat_toggle_reaction` foram preservadas; seus wrappers também foram explicitamente restringidos a `authenticated`. Os três helpers de refresh de preview não têm wrapper público e são trigger-only.

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
idx_search_queries_session_created_at ON search_queries(session_id, created_at DESC) WHERE session_id IS NOT NULL

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
SET search_path = ''  -- obrigatório; referências a tabelas/funções devem ser qualificadas
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

Depois da criação, aplique `REVOKE ALL ... FROM public, anon, authenticated, service_role` e conceda apenas os papéis necessários ao contrato. Funções trigger-only normalmente não recebem grant de API; wrappers `SECURITY INVOKER` recebem o grant público e a folha de `kc_private` recebe somente o grant indispensável para a delegação.
