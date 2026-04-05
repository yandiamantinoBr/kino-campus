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
Busca lista de posts com filtros.

**Params:**
```javascript
{
  module: string,       // Filtrar por módulo (opcional)
  category: string,     // Filtrar por categoria (opcional)
  query: string,        // Busca textual (opcional)
  sort: 'recent' | 'top' | 'discussed',  // Ordenação (default: 'recent')
  limit: number,        // Quantidade (default: 20)
  offset: number,       // Paginação offset (deprecated — usar cursor em v9.2.2)
}
```

**Retorno:** `Promise<KCPostModel[]>`

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

**Retorno:** `Promise<{ ok: boolean, post: KCPostModel, error?: object }>`

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

---

### `KCAPI.getPostsByAuthorId(authorId, params)`
Retorna posts de um autor específico.

**Retorno:** `Promise<KCPostModel[]>`

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
