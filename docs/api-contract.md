# KinoCampus — Contrato da API (KCAPI)

> **Estado:** v11.25.x (2026-04-12). As anotações de versão ao longo deste documento (`v9.x.x`, `v9.3.x`, etc.) são marcadores históricos que indicam quando cada contrato foi introduzido ou estendido — não indicam a versão atual. O estado ativo da API reflete todas as iterações da trilha v11 (v11.1.0–v11.25.x).

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

**Retorno:** `Promise<{ kinds: string[] }>`

**Semântica atual:**
- `favorite`: favorito pessoal
- `later`: lembrar depois
- `highlight`: destaque público

Se o driver ativo não suportar o recurso, a fachada retorna `{ kinds: [] }`.

---

### `KCAPI.setSavedPostState(postId, kind, enabled)`
Salva ou remove post dos salvos.

**Kind:** `'favorite' | 'later' | 'highlight'`

**Retorno:** `Promise<{ ok: boolean, error?: object | string }>`

Se o driver ativo não suportar o recurso, a fachada retorna `{ ok: false, error: { message } }`.

---

### `KCAPI.clearSavedPostState(postId, kind)`
Remove explicitamente um tipo de salvo de um post.

**Kind:** `'favorite' | 'later' | 'highlight'`

**Retorno:** `Promise<{ ok: boolean, error?: object | string }>`

---

### `KCAPI.getMySavedPosts(params)`
Retorna posts salvos do usuário logado. **Requer autenticação.**

**Retorno:** `Promise<KCPostModel[]>`

---

## Métodos de Ajuda

### `KCAPI.createHelpRequest(payload)`
Cria ticket de suporte.

**Payload:**
```javascript
{
  type: string,
  topic: string,
  subtopic?: string | null,
  subject: string,
  message: string,
  priority?: 'low' | 'normal' | 'high' | 'urgent',
  page_path?: string | null,
  contact_email?: string | null,
  allow_contact?: boolean,
  metadata?: object,
  expected_auth_state: 'anonymous' | 'authenticated',
  expected_user_id?: string | null,
  idempotency_key?: string, // 64 hex; obrigatório e gerado pelo cliente nos 3 fluxos LGPD
  turnstile_token?: string, // obrigatório e efêmero somente no envio visitante dos 3 fluxos LGPD
}
```

**Retorno:**

```javascript
Promise<{
  ok: boolean,
  data?: {
    id: string, // referência interna do atendimento
    created_at: string,
    data_subject_request: DataSubjectRequest | null,
    protocol: string | null,
    reused_existing_data_subject_request: boolean,
    idempotency_replayed: boolean,
  },
  notification?: object,
  error?: object,
}>
```

Observações:

- os nomes do payload são `snake_case`; a fachada não traduz aliases em
  `camelCase`;
- pedidos de privacidade usam `metadata.request_kind` com um dos valores
  `data_access_copy`, `data_portability` ou `account_erasure`;
- nesses três pedidos, o controller gera e conserva a chave opaca por caller e
  finalidade. A chave não integra `metadata`, o objeto criado, logs ou analytics;
- com uma conta autenticada real, ticket e protocolo são criados ou reutilizados
  atomicamente pela RPC autenticada. O Supabase Anonymous Auth permanece
  desabilitado;
- como visitante, o adapter envia `{ turnstile_token, payload }` à Edge
  `kc-create-privacy-help-guest`. A Edge valida o token no Siteverify e chama
  somente o wrapper SQL de `service_role`; o navegador recebe uma referência de
  atendimento e o protocolo só pode ser vinculado depois da verificação de
  identidade;
- `turnstile_token` fica apenas em memória/transporte, é removido antes do RPC,
  não integra `metadata`, idempotência, armazenamento ou logs da aplicação e é
  resetado após cada tentativa;
- a sessão autenticada não autoriza o navegador a enviar `user_id`: a identidade
  é sempre derivada no servidor;
- o controller preenche `expected_auth_state` e, quando autenticado,
  `expected_user_id` com o estado observado antes do envio. Adapter e RPC
  revalidam ambos imediatamente antes da gravação. Um rascunho iniciado como
  visitante falha com `ACCOUNT_CHANGED`/`AUTH_ACCOUNT_CHANGED` se uma conta
  aparecer durante o envio, em vez de ser atribuído a ela;
- integrações que chamam a fachada diretamente também devem enviar essa
  expectativa. Clientes legados com `expected_user_id` continuam compatíveis;
  clientes sem qualquer expectativa só podem gravar enquanto permanecerem
  anônimos.

---

### `KCAPI.recoverPrivacyHelpRequest(payload)`

Reconcilia uma tentativa pendente dos três pedidos LGPD da Central de Ajuda sem
reenviar assunto, mensagem, e-mail ou metadata do formulário.

```javascript
{
  idempotency_key: string, // 64 hex; chave opaca já preservada na sessão
  request_kind: 'data_access_copy' | 'data_portability' | 'account_erasure',
  expected_auth_state: 'anonymous' | 'authenticated', // estado atual
  expected_user_id?: string | null, // obrigatório para conta real
  source_auth_state?: 'anonymous' | 'authenticated', // estado do envio original
}
```

**Retorno confirmado:**

```javascript
Promise<{
  ok: true,
  data: {
    id: string,
    created_at: string,
    data_subject_request: DataSubjectRequest | null,
    protocol: string | null,
    reused_existing_data_subject_request: boolean,
    idempotency_replayed: true,
  },
  recovery: {
    state: 'recovered',
    safe_to_replace: false,
  },
}>
```

Quando não há recibo confirmado, a fachada retorna `ok: false` e diferencia:

- `HELP_IDEMPOTENCY_RECOVERY_RETIRED`: o servidor instalou ou confirmou uma
  barreira durável contra um `create` atrasado; somente neste caso
  `error.idempotency.safe_to_replace` e `response_confirmed` são `true`;
- `HELP_IDEMPOTENCY_RECOVERY_AMBIGUOUS`: não existe prova suficiente para
  aposentar a chave, portanto ela deve ser preservada e nenhum novo envio pode
  substituí-la;
- falha de transporte, envelope incompleto, conflito, troca de conta ou
  integridade inconclusiva também preserva a chave.

O runtime atual não cria usuários anônimos no Supabase. A compatibilidade
defensiva para um caller técnico que preserve exatamente o mesmo UUID não
autoriza ativar Anonymous Auth nem converter um guest sem UID em conta. Outra
conta e sessão revogada não podem adotar a tentativa. A recuperação guest usa
diretamente a RPC pública com a chave opaca, sem novo Turnstile porque não cria
Help nem reenvia PII. Guest ausente permanece `ambiguous`: não cria bucket
global compartilhado nem autoriza rotação automática.

---

### `KCAPI.createDataSubjectRequest(payload)`

Cria ou reutiliza de forma idempotente uma solicitação autenticada de direito do
titular.

```javascript
{
  request_kind: 'data_access_copy' | 'data_portability' | 'account_erasure',
  request_source?: 'settings' | 'help' | string,
  idempotency_key?: string, // gerada pela fachada quando omitida
}
```

O formato direto atualmente suportado é JSON. E-mail e `user_id` não fazem parte
do payload: são derivados da sessão ativa.

**Retorno:**

```javascript
Promise<{
  ok: boolean,
  data?: {
    request: DataSubjectRequest,
    reused_existing: boolean,
    reuse_reason: string | null,
  },
  error?: { code: string, message: string },
}>
```

---

### `KCAPI.listDataSubjectRequests(options?)`

Lista somente protocolos pertencentes à sessão atual, em ordem decrescente de
criação.

```javascript
{
  limit?: number, // 1..100; padrão 50
  expected_user_id?: string,
}
```

**Retorno:** `Promise<{ ok: boolean, data?: { items: DataSubjectRequest[], total: number }, error?: object }>`

---

### `KCAPI.getDataSubjectRequest(protocol, options?)`

Consulta um protocolo do próprio titular. Inclui a linha do tempo pública, sem
identificador do operador, e o estado de eventual suplemento assistido.

`options.expected_user_id` vincula a consulta à conta capturada pela interface.

**Retorno:**

```javascript
Promise<{
  ok: boolean,
  data?: {
    request: DataSubjectRequest,
    events: Array<{
      status: string,
      event_type: string,
      public_message: string | null,
      created_at: string,
    }>,
    supplement: object | null,
  },
  error?: object,
}>
```

---

### `KCAPI.downloadDataSubjectExport(protocol, options?)`

Reserva uma tentativa e gera a cópia eletrônica limitada do próprio titular. O
servidor exige sessão ativa também durante a geração, usa `Cache-Control:
no-store`, protege dados de terceiros e pode devolver um manifesto parcial com
suplemento assistido pendente.

`options.expected_user_id` é revalidado no adapter e na Edge antes da reserva.

**Retorno:** `Promise<{ ok: boolean, data?: { filename: string, content_type: 'application/json', request: DataSubjectRequest, export: object, supplement: object | null }, error?: object }>`

---

### `KCAPI.downloadDataSubjectSupplement(protocol, artifactRef, options?)`

Baixa o artefato integral assistido após nova validação de sessão, titularidade,
estado, expiração, hash e tamanho. A entrega consumida é registrada de forma
atômica; o bucket privado nunca é exposto diretamente ao navegador.
`options.expected_user_id` impede que a troca de conta reutilize uma ação de
download já iniciada.

**Retorno:** usa a mesma forma de download, acrescentando `supplement` com o
comprovante de consumo.

---

### `KCAPI.cancelDataSubjectRequest(protocol, options?)`

Cancela uma solicitação ainda reversível pertencente ao titular. Exportações em
falha parcial também são canceláveis; artefatos privados deixam de ser
entregáveis e entram no fluxo de limpeza. A etapa irreversível da exclusão não
pode ser cancelada.
`options.expected_user_id` é obrigatório no controller autenticado para que a
troca de conta falhe antes da mutação.

**Retorno:** `Promise<{ ok: boolean, data?: { request: DataSubjectRequest }, error?: object }>`

---

### `KCAPI.processDataExportSupplement(payload)`

Operação administrativa para preparar, revisar, validar, publicar ou limpar o
suplemento assistido. Exige sessão administrativa ativa, claims com lease e
versão CAS; não é uma API de usuário final.

**Retorno:** `Promise<{ ok: boolean, data?: object, error?: object }>`

---

### `DataSubjectRequest`

Forma pública resumida. Campos internos, e-mail, hashes operacionais, claims e
identificadores de atores não integram este contrato.

```javascript
{
  id: string,
  protocol: string,
  help_request_id: string | null,
  request_kind: 'data_access_copy' | 'data_portability' | 'account_erasure',
  requested_format: 'json',
  request_source: string,
  export_schema_version: string,
  scope: string[],
  status:
    | 'received'
    | 'processing'
    | 'ready'
    | 'pending_confirmation'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'partial_failure'
    | 'expired',
  ready_at: string | null,
  expires_at: string | null,
  completed_at: string | null,
  cancelled_at: string | null,
  retention_until: string | null,
  created_at: string,
  updated_at: string,
}
```

---

### `KCAPI.listAdminHelpRequests(filters)`
Lista tickets de ajuda para o admin.

**Filters:**
```javascript
{
  status?: string,
  type?: string,
  priority?: string,
  query?: string,
  limit?: number,
  offset?: number,
}
```

**Retorno:** array de tickets com metadados anexados:

```javascript
Promise<Array<{
  id: string,
  user_id: string | null,
  type: string,
  topic: string,
  subtopic?: string | null,
  subject: string,
  message: string,
  priority: string,
  status: string,
  page_path?: string | null,
  contact_email?: string | null,
  allow_contact?: boolean,
  metadata?: object,
  created_at: string,
  updated_at: string,
}>> & {
  totalCount: number,
  limit: number,
  offset: number,
  hasMore: boolean,
}
```

**Notas v10:**
- o caminho preferencial usa a RPC `kc_admin_list_help_requests_paged(...)`
- filtros por `priority` e busca textual ainda podem usar fallback controlado via query direta

---

### `KCAPI.updateAdminHelpRequest(id, patch)`
Atualiza um ticket de ajuda no admin.

**Patch aceito:**
```javascript
{
  status?: string,
  priority?: string,
  metadata?: object,
}
```

**Retorno:** `Promise<{ ok: boolean, error?: object }>`

---

## Métodos de Notificações

### `KCAPI.getNotifications(limit?, offset?)`
Lista notificações do usuário autenticado.

**Retorno:** `Promise<{ ok: boolean, notifications: object[], unread: number, total: number, error?: string }>`

### `KCAPI.markNotificationsRead(ids)`
Marca um conjunto de notificações como lidas.

**Retorno:** `Promise<{ ok: boolean, error?: string }>`

### `KCAPI.markAllNotificationsRead()`
Marca todas as notificações do usuário como lidas.

**Retorno:** `Promise<{ ok: boolean, error?: string }>`

### `KCAPI.clearNotifications()`
Limpa as notificações do usuário autenticado no feed in-app.

**Retorno:** `Promise<{ ok: boolean, deleted?: number, error?: string }>`

### `KCAPI.getNotificationPreferences()`
Retorna a matriz de preferências de notificação por evento e canal do usuário autenticado.

**Retorno:**
```javascript
Promise<{
  comment_on_post: { in_app: boolean, email: boolean, whatsapp: boolean },
  comment_reply:   { in_app: boolean, email: boolean, whatsapp: boolean },
  vote_on_post:    { in_app: boolean, email: boolean, whatsapp: boolean },
  post_expired:    { in_app: boolean, email: boolean, whatsapp: boolean },
  post_reported:   { in_app: boolean, email: boolean, whatsapp: boolean },
  system:          { in_app: boolean, email: boolean, whatsapp: boolean },
}>
```

**Notas v11.20.1:**
- o contrato retorna defaults canônicos e backfill-safe quando o usuário ainda não possui row em `notification_preferences`
- a partir de `v11.21.1`, `email` e `whatsapp` ja fazem parte da trilha externa; a entrega real continua gated por segredos de provider e pelo destino privado configurado do usuario

### `KCAPI.updateNotificationPreferences(preferences)`
Atualiza as preferências de notificação por evento e canal do usuário autenticado.

**Body esperado:**
```javascript
{
  comment_on_post?: { in_app?: boolean, email?: boolean, whatsapp?: boolean },
  comment_reply?:   { in_app?: boolean, email?: boolean, whatsapp?: boolean },
  vote_on_post?:    { in_app?: boolean, email?: boolean, whatsapp?: boolean },
  post_expired?:    { in_app?: boolean, email?: boolean, whatsapp?: boolean },
  post_reported?:   { in_app?: boolean, email?: boolean, whatsapp?: boolean },
  system?:          { in_app?: boolean, email?: boolean, whatsapp?: boolean },
}
```

**Retorno:** `Promise<{ ok: boolean, data?: { preferences: object }, error?: { message?: string } }>`

### `KCAPI.getNotificationChannelTargets()`
Retorna os destinos privados configurados para canais externos do usuario autenticado.

**Retorno:**
```javascript
Promise<{
  whatsapp: {
    channel: 'whatsapp',
    destination: string,
    country_code: string,
    local_number: string,
    consent_granted: boolean,
    consent_at: string | null,
    configured: boolean,
    ready: boolean,
    display: string,
    metadata: { country_code?: string }
  }
}>
```

**Notas v11.21.1:**
- o destino privado de `whatsapp` fica separado do contato publico do perfil/produto
- `destination` usa formato E.164 (`+5562998765432`)
- `ready=true` so quando existir numero valido e consentimento explicito

### `KCAPI.updateNotificationChannelTargets(targets)`
Atualiza os destinos privados configurados para canais externos do usuario autenticado.

**Body esperado:**
```javascript
{
  whatsapp?: {
    country_code?: string,
    local_number?: string,
    consent_granted?: boolean,
    metadata?: { country_code?: string }
  }
}
```

**Retorno:** `Promise<{ ok: boolean, data?: { targets: object }, error?: { message?: string } }>`

### `KCAPI.getUnreadNotificationCount()`
Retorna apenas a contagem de não lidas.

**Retorno:** `Promise<number>`

### `KCAPI.subscribeNotifications(userId, callback)`
Assina atualizações em tempo real para notificações.

O callback recebe um envelope no formato:

`{ eventType: 'INSERT' | 'UPDATE' | 'DELETE', new: object | null, old: object | null }`

**Retorno:** `RealtimeChannel | null`

### `KCAPI.unsubscribeNotifications(channel)`
Encerra uma assinatura de notificações.

**Retorno:** `void`

---

## Métodos de Convites Externos

### `KCAPI.inviteExternalUser(email, note?)`
Dispara o convite externo via Edge Function administrativa.

**Retorno:** `Promise<{ ok: boolean, data?: object, error?: string }>`

### `KCAPI.getInvites()`
Lista convites administrativos existentes.

**Retorno:** `Promise<{ data: object[] | null, error: string | null }>`

### `KCAPI.revokeInvite(email)`
Revoga um convite externo.

**Retorno:** `Promise<{ ok: boolean, error?: string }>`

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
