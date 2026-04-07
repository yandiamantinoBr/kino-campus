# KinoCampus — Contrato da API (KCAPI)

## Como usar

```javascript
// KCAPI é exposto globalmente após kc-api.client.js carregar
// Todos os métodos retornam Promises

KCAPI.getPosts({ module: 'eventos' })
  .then(posts => console.log(posts))
  .catch(err => console.error(err));
```

## Contrato de Post (KCPostModel)

Todo post normalizado via `KCPostModel.from()` tem a seguinte forma:

```javascript
{
  id: string,              // UUID (produção) ou number (legado)
  modulo: string,          // 'compra-venda' | 'caronas' | 'moradia' | 'eventos' | 'oportunidades' | 'achados-perdidos'
  categoria: string,       // Label da categoria (ex: "Eletrônicos")
  categoriaKey: string,    // Chave interna (ex: "eletronicos")
  titulo: string,
  descricao: string,
  preco: number | null,
  authorId: string,        // UUID do autor
  author: object | null,   // Profile normalizado (se expandido)
  timestamp: string,       // ISO8601
  emoji: string,           // Emoji do módulo
  status: 'published' | 'hidden' | 'expired' | 'pending' | 'deleted',
  visibility: 'public' | 'private',
  verificado: boolean,     // Se autor é verificado
  votos: number,
  comentarios: number,
  imagens: string[],       // URLs das imagens
  coverImage: string | null,
  metadata: object,        // JSONB livre para dados extras do módulo
  subcategoria: string,    // Subcategoria (ex: topico, tipo, status)
  tags: string[],
  expiresAt: string | null,  // ISO8601
  bumpedAt: string | null,   // ISO8601
}
```

## Métodos de Post

### `KCAPI.getPosts(params)`
Busca lista de posts com filtros. Mantido por compatibilidade para telas auxiliares e consumo legado.

**Params:**
```javascript
{
  module: string | string[],
  category: string,
  subcategory: string,
  q: string,
  tag: string,
  sortBy: 'recentes' | 'votos' | 'comentados',
  limit: number,
}
```

**Retorno:** `Promise<KCPostModel[]>`

**Compatibilidade v9.2.2:** feeds incrementais migraram para `KCAPI.getFeedCursor()`. `getPosts()` continua estável para listagens legadas e fluxos auxiliares.

---

### `KCAPI.searchPosts(params)`
Busca server-side dedicada para a UI de busca (`search-results.html` e dropdown global do header).

**Params:**
```javascript
{
  q: string,
  module: string,
  category: string,
  subcategory: string,
  limit: number,
}
```

**Retorno:** `Promise<KCPostModel[]>`

**Notas v9.2.0:**
- `KCAPI.getPosts()` continua legado/estável e não foi reinterpretado como FTS.
- Sinônimos continuam expandidos no client antes do RPC.
- A superfície de busca cobre `title`, `description`, `tags`, `category` e `subcategory`.

---

### `KCAPI.getFeedCursor(params)`
Busca lotes incrementais do feed via cursor opaco. É o contrato usado pelos pagers a partir de `v9.2.2`.

**Params:**
```javascript
{
  module: string | string[],
  category: string,
  subcategory: string,
  q: string,
  tag: string,
  sortBy: 'recentes' | 'votos' | 'comentados',
  limit: number,
  cursor: string | null,
  requestParams?: {
    marketCats?: string[],
    marketConds?: string[],
    marketVerified?: boolean,
    datePreset?: string,
    priceMin?: number,
    priceMax?: number,
    rideType?: string[],
    rideCampus?: string[],
    ridePeriod?: string[],
    rideFeatures?: string[],
    rideVerified?: boolean,
    rideOrigin?: string,
    rideDestination?: string,
    housingFeatures?: string[],
    housingRegion?: string,
    oppType?: string[],
    oppMode?: string[],
    oppArea?: string,
    lfStatus?: string[],
    lfType?: string[],
    lfLocation?: string,
  },
}
```

**Retorno:**
```javascript
Promise<{
  posts: KCPostModel[],
  nextCursor: string | null,
  hasMore: boolean,
}>
```

**Notas:**
- `cursor` é opaco e pode ter representações diferentes entre `local` e `supabase`.
- Feeds híbridos podem passar `module` como array, por exemplo `['compra-venda', 'livros']`.
- `requestParams` carrega o envelope dos filtros avançados já existentes nos módulos (`compra-venda`, `caronas`, `moradia`, `oportunidades` e `achados-perdidos`) para o caminho incremental cursor-based.
- `datePreset` foi fechado em `v9.2.1.3` e hoje cobre os 6 módulos do feed incremental. Semântica: `today/last7d/last30d` para `compra-venda`, `livros`, `moradia`, `oportunidades` e `achados-perdidos`; `today/last3d/last7d` para `caronas`; `today/next7d/thisMonth/past` para `eventos`, usando `metadata.data_evento`/`metadata.data` com fallback para `created_at`.
- `priceMin` e `priceMax` foram adicionados ao contrato cursor-based em `v9.2.1.2`; hoje eles alimentam as faixas de preço/remuneração de `compra-venda`, `caronas`, `moradia` e `oportunidades`.
- `KCAPI.getPosts()` permanece estável para consumo legado; a aplicação cursor-based dos filtros avançados foi adicionada em `v9.2.1.1`, expandida em `v9.2.1.2` e concluída em `v9.2.1.3` sem reinterpretar o contrato antigo.

---

### `KCAPI.getPostById(id)`
Busca post individual com dados completos.

**Params:** `id: string` (UUID)

**Retorno:** `Promise<KCPostModel | null>`

---

### `KCAPI.createPost(body)`
Cria novo post. **Requer autenticação.**

**Body:**
```javascript
{
  module: string,       // Obrigatório
  title: string,        // Obrigatório
  description: string,
  category: string,
  price: number | null,
  images: string[],     // dataURLs ou URLs existentes (max 5)
  coverIndex: number,   // Índice da imagem de capa (default: 0)
  metadata: object,     // Dados extras do módulo
  tags: string[],
}
```

**Retorno normal:** `Promise<KCPostModel>` com os dados do post criado.

**Retornos especiais:**
```javascript
// Limite de posts ativos atingido:
{ _kcError: 'POST_LIMIT_REACHED', message: string, limit: number, count: number }

// Flood control (max 3 posts/hora) — v9.3.2:
{ _kcError: 'FLOOD_LIMIT', message: string }

// Post criado mas em análise pela moderação — v9.3.2:
// (post com status='pending' retornado pelo trigger)
KCPostModel & { _kcPending: true, _kcPendingReason: string }
```
O caller (`kc-create-post.js`) verifica `_kcError` ANTES de qualquer outro campo. Se `_kcPending=true`, mostra toast de aviso e continua o redirect (autor pode ver o post).

---

### `KCAPI.updatePost(postId, payload)`
Atualiza post existente. **Requer autenticação (próprio autor ou admin).**

**Retorno:** `Promise<{ ok: boolean, error?: object }>`

---

### `KCAPI.deletePost(postId)`
Remove post. **Requer autenticação (próprio autor ou admin).**

**Retorno:** `Promise<{ ok: boolean, error?: object }>`

---

### `KCAPI.reportPost(postId, payload)`
Denuncia post. **Requer autenticação.**

**Payload:** `{ reason: string, details?: string }`

**Retorno:** `Promise<{ ok: boolean, error?: object }>`

---

### `KCAPI.togglePostStatus(postId)`
Alterna status do post entre 'published' e 'hidden'. **Requer autenticação (autor ou admin).**

**Retorno:** `Promise<{ ok: boolean, status: string, error?: object }>`

---

### `KCAPI.renewPost(postId)`
Reativa post expirado ou escondido. Redefine expires_at (7d caronas / 30d outros).

**Retorno:** `Promise<{ ok: boolean, expires_at: string, error?: object }>`

---

### `KCAPI.bumpPost(postId)`
Sobe post para o topo do feed. Cooldown de 1 dia por post.

**Retorno:** `Promise<{ ok: boolean, bumped_at: string, next_bump_at: string, error?: object }>`

---

### `KCAPI.checkDuplicatePost(userId, module, title)`
Verifica se existe post similar. Usado para anti-spam na criação.

**Retorno:** `Promise<{ isDuplicate: boolean, similarPost?: KCPostModel }>`

---

## Métodos de Engajamento

### `KCAPI.votePost(postId, direction, options)`
Vota em post. **Requer autenticação.**

**Direction:** `'up' | 'down'`

**Retorno:** `Promise<{ ok: boolean, vote: number, userVote: string }>`

---

### `KCAPI.getMyVote(postId)`
Verifica voto do usuário logado em um post.

**Retorno:** `Promise<{ vote: 'up' | 'down' | null }>`

---

### `KCAPI.trackCouponClick(postId)`
Registra que o CTA do post foi clicado (contribui para ranking).

**Retorno:** `Promise<void>`

---

### `KCAPI.trackShare(postId)`
Registra compartilhamento (contribui para ranking).

**Retorno:** `Promise<void>`

---

### `KCAPI.trackView(postId)` *(v9.3.1)*
Registra visualizacao de post. Anti-spam: 1 view/usuario/post/hora. Self-views nao contam.

**Retorno:** `Promise<{ ok: boolean, counted: boolean, code?: string, view_count?: number }>`

---

### `KCAPI.getPostAnalytics(postId)` *(v9.3.1)*
Retorna metricas completas de um post. Apenas autor ou admin.

**Retorno:** `Promise<{ ok: boolean, views: number, votos: number, comments: number, shares: number, coupon_clicks: number, saves: number, highlight_score: number, created_at: string }>`

---

### `KCAPI.getTopContributors(period, module, limit)`
Retorna ranking de top contribuidores.

**Params:**
- `period: 'day' | 'week' | 'month'` (default: 'month')
- `module: string | null` (null = ranking geral)
- `limit: number` (default: 10)

**Retorno:** `Promise<Array<{ user_id, display_name, avatar_url, score, rank, breakdown }>>`

---

### `KCAPI.getRelatedPosts(postId, options)`
Retorna posts relacionados ao post atual.

**Retorno:** `Promise<KCPostModel[]>`

---

## Métodos de Comentários

### `KCAPI.getComments(postId)`
Busca comentários de um post.

**Retorno:** `Promise<Comment[]>`

```javascript
// Contrato Comment:
{
  id: string,
  post_id: string,
  parent_id: string | null,
  author_id: string,
  author_name: string,
  author_avatar: string,
  body: string,
  created_at: string,
  likes: number,
  liked_by_me: boolean,
}
```

---

### `KCAPI.addComment(postId, body, options?)`
Adiciona comentário. **Requer autenticação.**

**Body:** `string`

**Options:** `{ parentId?: string }`

**Retorno:** `Promise<{ ok: boolean, data?: Comment, error?: object }>`

---

### `KCAPI.likeComment(commentId)`
Curtir/descurtir comentário. **Requer autenticação.**

**Retorno:** `Promise<{ ok: boolean, likes: number }>`

---

## Métodos de Perfil

### `KCAPI.getCurrentUser()`
Retorna usuário autenticado atual.

**Retorno:** `Promise<User | null>`

---

### `KCAPI.getMyProfile()`
Retorna perfil completo do usuário logado. **Requer autenticação.**

**Retorno:** `Promise<Profile | null>`

---

### `KCAPI.updateMyProfile(patch)`
Atualiza dados do perfil. **Requer autenticação.**

**Patch:** campos parciais do perfil (display_name, bio, social_links, etc.)

**Retorno:** `Promise<{ ok: boolean, error?: object }>`

---

### `KCAPI.uploadProfileAvatar(fileOrDataUrl)`
Faz upload do avatar do usuário para o Storage. **Requer autenticação.**

**Retorno:** `Promise<{ ok: boolean, url: string, error?: object }>`

---

### `KCAPI.getProfileById(id)`
Retorna perfil público de um usuário.

**Retorno:** `Promise<Profile | null>`

**Notas v9.1.2:**
- O payload público de perfil agora pode incluir `ratingAvg` / `ratingCount` (aliases camelCase de `rating_avg` / `rating_count`).

---

### `KCAPI.getPostsByAuthorId(authorId, params)`
Retorna posts de um autor específico.

**Retorno:** `Promise<KCPostModel[]>`

---

## Métodos de Avaliações de Usuários

### `KCAPI.getUserRatingSummary(userId)`
Retorna o resumo público de reputação de um usuário.

**Retorno:**
```javascript
Promise<{
  userId: string,
  average: number | null,
  count: number,
}>
```

---

### `KCAPI.getUserRatingState({ targetUserId, contextPostId })`
Retorna o estado do avaliador autenticado em relação ao usuário alvo. **Requer autenticação** para respostas úteis.

**Params:**
```javascript
{
  targetUserId: string,
  contextPostId?: string | null,
}
```

**Retorno:**
```javascript
Promise<{
  targetUserId: string,
  contextPostId: string | null,
  canRate: boolean,
  reason: 'OK' | 'AUTH_REQUIRED' | 'SELF' | 'NO_INTERACTION' | 'INVALID_CONTEXT' | 'TARGET_NOT_FOUND',
  myRating: {
    id: string,
    targetUserId: string,
    raterUserId: string,
    contextPostId: string | null,
    rating: number,
    comment: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
}>
```

**Notas v9.1.2:**
- A elegibilidade é liberada apenas quando o viewer já interagiu com posts do alvo via `comments`, `post_votes` ou `saved_posts`.
- Autoavaliação é sempre bloqueada.

---

### `KCAPI.listUserRatings(userId, options?)`
Lista as avaliações públicas de um usuário com paginação simples.

**Params:**
```javascript
{
  page?: number,
  limit?: number,
}
```

**Retorno:**
```javascript
Promise<{
  items: Array<{
    id: string,
    targetUserId: string,
    raterUserId: string | null,
    contextPostId: string | null,
    rating: number,
    comment: string | null,
    createdAt: string,
    updatedAt: string,
    reviewer: {
      id: string | null,
      displayName: string,
      avatarUrl: string | null,
      public: boolean,
    },
  }>,
  page: number,
  limit: number,
  total: number,
  hasMore: boolean,
}>
```

**Notas v9.1.2:**
- A identidade do avaliador é anonimizada quando o perfil dele não é público.

---

### `KCAPI.upsertUserRating(payload)`
Cria ou atualiza a avaliação do usuário autenticado para um alvo. **Requer autenticação.**

**Payload:**
```javascript
{
  targetUserId: string,
  contextPostId?: string | null,
  rating: 1 | 2 | 3 | 4 | 5,
  comment?: string | null,
}
```

**Retorno:**
```javascript
Promise<{
  ok: boolean,
  rating: {
    id: string,
    targetUserId: string,
    raterUserId: string,
    contextPostId: string | null,
    rating: number,
    comment: string | null,
    createdAt: string,
    updatedAt: string,
  },
  summary: {
    userId: string,
    average: number | null,
    count: number,
  },
}>
```

**Validações v9.1.2:**
- `rating` aceita apenas `1..5`.
- `comment` é opcional e limitado a `280` caracteres.
- O par `raterUserId -> targetUserId` é único; regravação usa `upsert`.

---

## Métodos de Posts Salvos

### `KCAPI.getSavedPostState(postId)`
Verifica estado de salvamento do post pelo usuário logado.

**Retorno:** `Promise<{ like: boolean, bookmark: boolean, [customKind]: boolean }>`

---

### `KCAPI.setSavedPostState(postId, kind, enabled)`
Salva ou remove post dos salvos.

**Kind:** `'like' | 'bookmark' | string`

**Retorno:** `Promise<{ ok: boolean }>`

---

### `KCAPI.getMySavedPosts(params)`
Retorna posts salvos do usuário logado. **Requer autenticação.**

**Retorno:** `Promise<KCPostModel[]>`

---

## Métodos de Ajuda

### `KCAPI.createHelpRequest(payload)`
Cria ticket de suporte.

**Payload:** `{ subject: string, message: string }`

**Retorno:** `Promise<{ ok: boolean, error?: object }>`

---

## Métodos de Autenticação

### `KCAPI.signIn(email, password)`
**Retorno:** `Promise<{ ok: boolean, user?, error? }>`

### `KCAPI.signUp(email, password, options)`
**Options:** `{ display_name?: string }`

**Retorno:** `Promise<{ ok: boolean, user?, error? }>`

### `KCAPI.requestPasswordReset(email, options)`
**Retorno:** `Promise<{ ok: boolean, error? }>`

### `KCAPI.updatePassword(password)`
**Requer autenticação.** **Retorno:** `Promise<{ ok: boolean, error? }>`

### `KCAPI.logout()`
**Retorno:** `Promise<void>`

---

## Tratamento de Erros

Todos os métodos podem rejeitar com um objeto de erro:
```javascript
{
  message: string,      // Mensagem legível
  code: string,         // Código interno (ex: 'POST_NOT_FOUND')
  details: string | null,
  hint: string | null,
}
```

**Padrão recomendado:**
```javascript
KCAPI.someMethod(args)
  .then(result => { ... })
  .catch(err => {
    console.error('[NomeDoController]', err.message);
    showErrorToast(err.message || 'Erro desconhecido');
  });
```

---

## KCLazyLoader (v9.4.0)

Utilitário de lazy loading para módulos JS não-críticos. Exposto em `window.KCLazyLoader` (frozen).

### `KCLazyLoader.load(src, callback?)`
Injeta `<script src>` dinamicamente. Idempotente — não recarrega se `src` já foi carregado.

### `KCLazyLoader.onVisible(selector, src, callback?)`
Carrega `src` quando o elemento CSS `selector` entra no viewport (IntersectionObserver com `rootMargin: 200px`). Fallback imediato se IntersectionObserver não estiver disponível.

### `KCLazyLoader.onInteraction(selector, events[], src, callback?)`
Carrega `src` na primeira ocorrência de qualquer `events[i]` no elemento `selector`.

---

## KCCompressImage (v9.4.1)

Utilitário de compressão client-side de imagens antes do upload. Exposto em `window.KCCompressImage`.

### `KCCompressImage(blob, maxWidth?, maxHeight?, quality?) → Promise<Blob>`

Comprime uma imagem via Canvas API antes de enviá-la ao Supabase Storage.

| Parâmetro  | Padrão | Descrição |
|------------|--------|-----------|
| `blob`     | —      | Blob da imagem original |
| `maxWidth` | `1200` | Largura máxima em px |
| `maxHeight`| `900`  | Altura máxima em px |
| `quality`  | `0.85` | Qualidade JPEG (0–1) |

**Comportamento:**
- GIF: pass-through (retorna blob original sem modificar — preserva animações)
- JPEG, PNG, WebP: redimensionado para `maxWidth × maxHeight` mantendo aspect ratio, exportado como `image/jpeg`
- Fallback: retorna blob original se Canvas falhar (toBlob = null ou erro de Image)
- `blob = null`: retorna `null`

**Uso pelo adapter:** Chamado automaticamente em `uploadPostImages` (max 1200×900) e `uploadProfileAvatar` (max 400×400) após a validação de magic bytes.

```javascript
// Uso direto (opcional — o adapter já chama internamente)
const compressed = await KCCompressImage(file, 800, 600, 0.80);
```
