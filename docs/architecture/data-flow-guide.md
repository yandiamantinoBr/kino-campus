# Guia de Fluxo de Dados — KinoCampus

**Versão:** v16.7.0 · **Atualizado em:** 2026-04-26

> Descreve o fluxo completo de dados desde a ação do usuário no browser até o banco de dados
> (Supabase) ou localStorage, passando por controller → KCAPI → adapter.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [O padrão Driver](#2-o-padrão-driver)
3. [Fluxo de leitura](#3-fluxo-de-leitura)
4. [Fluxo de escrita](#4-fluxo-de-escrita)
5. [Fluxo de autenticação](#5-fluxo-de-autenticação)
6. [Fluxo de notificações (Realtime)](#6-fluxo-de-notificações-realtime)
7. [Cache SWR](#7-cache-swr)
8. [Modo local (localStorage)](#8-modo-local-localstorage)
9. [Regras de segurança no fluxo](#9-regras-de-segurança-no-fluxo)

---

## 1. Visão geral

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                            │
│                                                                     │
│  Usuário interage (clique, scroll, submit de form)                  │
│         │                                                           │
│         ▼                                                           │
│  HTML (<script defer src="...">)                                    │
│  ├── Cadeia base (49 scripts: boot + utils + KCAPI + adapters)      │
│  └── Scripts específicos da página (controller + auxiliares)        │
│         │                                                           │
│         ▼                                                           │
│  Controller  (ex: eventos.controller.js)                            │
│  └── chama: KCAPI.getFeedCursor({ module: 'eventos', ... })         │
│         │                                                           │
│         ▼                                                           │
│  window.KCAPI  (kc-api.client.js — fachada única)                   │
│  ├── sub-módulos: kc-api.posts-feed.js, kc-api.auth.js, ...        │
│  └── getActiveDriver() → seleciona adapter pelo KC_ENV.driver       │
│         │                                                           │
│         ├── driver = 'local'  ──────────────────────────────────┐  │
│         │                                                        │  │
│         └── driver = 'supabase' ──────────────────────────┐     │  │
│                                                            │     │  │
│         ▼                                                  ▼     ▼  │
│  supabase.adapter.js               local.adapter.js           │  │
│  └── supabaseClient                └── fetchJSON()            │  │
│       (supabase-js SDK)                 /data/database.json   │  │
│         │                              localStorage            │  │
│         ▼                                    │                    │
│  Supabase Cloud                              └── resposta local    │
│  ├── PostgreSQL (tabelas + RLS)                                    │
│  ├── Auth API (JWT sessions)                                        │
│  ├── Storage (kino-media bucket)                                    │
│  └── Realtime (postgres_changes)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Camadas da arquitetura

| Camada | Artefatos | Responsabilidade |
|--------|-----------|-----------------|
| **HTML** | 27 arquivos `.html` no repositorio; 26 canonicos validados | Carrega scripts em ordem correta via `<script defer>` |
| **Boot** | `boot/` (9 arquivos) | `KC_CONSTANTS`, `KC_ENV`, `KCFF`, SEO/analytics, SW, telemetria |
| **Utils** | `utils/` (8 arquivos) | `KCUtils.escapeHtml`, formatação, dates, slugify |
| **KCAPI** | `api/` (22 arquivos) | Fachada única — contrato público, sub-módulos, driver selection |
| **Adapters** | `adapters/local/` + `adapters/supabase/` (21 arquivos) | Implementações concretas por driver |
| **Core** | `core/` (12 arquivos) | i18n, profiles, consentimento, notificações UI, shell |
| **Controller** | `controllers/` (48 arquivos) | Orquestra UI, chama KCAPI, renderiza resultados |

---

## 2. O padrão Driver

### O que é o Driver

O driver é o mecanismo de **seleção de fonte de dados** em runtime. Toda chamada de dados passa pela fachada `KCAPI`, que delega ao adapter ativo com base em `KC_ENV.driver`.

```javascript
// Em kc-api.client.js
function getActiveDriver() {
  if (ENV.driver === 'supabase' && _adapters['supabase']) return _adapters['supabase'];
  if (_adapters['local']) return _adapters['local'];
  throw new Error('No driver adapters loaded!');
}
```

### Como o driver é definido

| Ambiente | Valor | Fonte |
|----------|-------|-------|
| **Produção (Vercel)** | `'supabase'` | Variável de ambiente `KC_DRIVER=supabase` injetada em `kc-env.js` |
| **Desenvolvimento local** | `'local'` | `KC_DRIVER=local` ou ausente (default) |
| **Proteção de produção** | `__invalid_production_driver__` | `kc-env.js` bloqueia fallback silencioso — loga erro |

```javascript
// kc-env.js — proteção obrigatória
if (productionRequiresSupabase) {
  merged.driver = '__invalid_production_driver__';
  console.error('[KC_ENV] Política de ambiente violada: em produção, driver deve ser "supabase".');
}
```

### Registro de adapters

Os adapters se auto-registram ao serem carregados (`<script defer>`), depois que `KCAPI` já está disponível:

```javascript
// local.adapter.js (posição 32–38 na cadeia de boot)
window.KCAPI.registerAdapter('local', driverLocal);

// supabase.adapter.js (posição 49 — último da cadeia base)
window.KCAPI.registerAdapter('supabase', driverSupabase);
```

### Diagrama de seleção

```
KC_ENV.driver
    │
    ├── 'supabase'  →  _adapters['supabase']  →  supabase.adapter.js
    │                                              └── supabase-js SDK
    │                                                   └── Supabase Cloud
    │
    └── 'local'    →  _adapters['local']     →  local.adapter.js
                                                  └── fetchJSON('/data/database.json')
                                                  └── localStorage
```

---

## 3. Fluxo de leitura

### Exemplo: feed de publicações (página `_eventos.html`)

#### Passo a passo

```
1. Usuário abre /eventos
   │
2. Browser carrega _eventos.html
   ├── 49 scripts da cadeia base (boot → utils → KCAPI → adapters)
   └── Posição 50+: kc-feed.controller.js + eventos.controller.js
   │
3. DOMContentLoaded → eventos.controller.js inicializa
   │
4. Controller chama:
   │   KCAPI.getFeedCursor({
   │     module: 'eventos',
   │     sortBy: 'recentes',
   │     limit: 20,
   │     cursor: null
   │   });
   │
5. KCAPI.getFeedCursor() →  kc-api.posts-feed.js (sub-módulo)
   │   └── buildPostsFeedDeps() → { getActiveDriver, ENV }
   │
6. getActiveDriver() → retorna _adapters['supabase'] (em produção)
   │
7. supabase.posts-read.adapter.js (via driverSupabase.getPosts)
   │   └── client.from('posts')
   │         .select('id, titulo, descricao, categoria, ...')
   │         .eq('modulo', 'eventos')
   │         .eq('status', 'published')
   │         .order('created_at', { ascending: false })
   │         .range(0, 19)
   │
8. Supabase PostgreSQL executa query com RLS aplicada
   │   └── RLS verifica: posts_select_published (status = 'published')
   │
9. Array de posts retorna até KCAPI
   │   └── normalizePost() aplicado a cada item
   │
10. Controller recebe dados → renderPosts(posts)
    └── DOM atualizado:
        el.innerHTML = KCUtils.escapeHtml(post.titulo)  ← obrigatório
```

#### Código representativo (controller)

```javascript
// Em eventos.controller.js (simplificado)
async function loadFeed(cursor) {
  const result = await KCAPI.getFeedCursor({
    module: 'eventos',
    sortBy: 'recentes',
    limit: 20,
    cursor: cursor || null,
  });
  const posts = Array.isArray(result.posts) ? result.posts : [];
  posts.forEach(function (post) {
    const el = document.createElement('article');
    // OBRIGATÓRIO: escapeHtml antes de innerHTML em conteúdo de usuário
    el.innerHTML = '<h2>' + KCUtils.escapeHtml(post.titulo) + '</h2>';
    container.appendChild(el);
  });
}
```

### Fluxo em modo local

```
getActiveDriver() → _adapters['local']
    │
    └── local.posts-read.adapter.js
         └── getDatabaseNormalized()
              └── fetchJSON('/data/database.json')
                   └── Arquivo JSON estático (data de fixture)
```

---

## 4. Fluxo de escrita

### Exemplo: criar publicação (`create-post.html`)

```
1. Usuário preenche formulário em /create-post
   │
2. Submit → kc-create-post.js (controller da página)
   │
3. Coleta e valida campos do formulário
   │
4. Chama KCAPI.createPost(payload):
   │   {
   │     titulo: '...',
   │     descricao: '...',
   │     moduleDB: 'eventos',
   │     categoryDB: '...',
   │     images: [File, File, ...]
   │   }
   │
5. KCAPI.createPost() → getActiveDriver().createPost(body)
   │
6. supabase.posts-write.adapter.js → createPost(data):
   │
   ├── 6a. Verificar autenticação
   │         KCSupabase.getUser() → user.id
   │         Se não autenticado → erro 'UNAUTHENTICATED'
   │
   ├── 6b. Sincronizar perfil (syncProfile)
   │         Garante que profiles.id existe para o user
   │
   ├── 6c. Verificar limite de posts ativos
   │         RPC: kc_active_post_count(user_id)
   │         Se excede limite → erro 'POST_LIMIT'
   │
   ├── 6d. Construir payload de inserção
   │         { titulo, descricao, modulo, categoria, author_id: user.id, status: 'published', ... }
   │
   ├── 6e. Inserir na tabela posts
   │         client.from('posts').insert(insertPayload).select('id').single()
   │         RLS: posts_insert_authenticated — só usuários verified
   │
   └── 6f. Upload de imagens (se houver)
             client.storage.from('kino-media').upload(path, file)
             URLs retornadas → salvas em posts.images (update)
   │
7. Resultado retorna ao controller
   └── Sucesso → redirecionar para página do post
   └── Erro → exibir mensagem ao usuário
```

### Fluxo em modo local

```
getActiveDriver() → _adapters['local']
    └── Sem auth real, sem persistência real
    └── Simula inserção em localStorage
    └── Retorna post fake para feedback de UX
```

---

## 5. Fluxo de autenticação

### Login (`login.html` ou `account-setup.html`)

```
1. Usuário informa e-mail + senha → submit
   │
2. login.controller.js chama:
   │   KCAPI.signIn(email, password)
   │
3. KCAPI.signIn() → kc-api.auth.js → signIn(email, password, deps)
   │
   ├── Verifica driver: se 'local' → retorna erro 'Modo local (Auth desabilitado)'
   │
   └── Driver 'supabase':
        KCSupabase.signIn(email, password)
         └── supabase-js: auth.signInWithPassword({ email, password })
              │
              ├── Supabase Auth API valida credenciais
              ├── Retorna { user, session } com JWT
              └── supabase-js persiste sessão em localStorage (sb-<ref>-auth-token)
   │
4. Resultado retorna ao controller
   ├── Sucesso → redirecionar para página destino
   └── Erro → exibir mensagem de credenciais inválidas
```

### Registro (`account-setup.html`)

```
KCAPI.signUp(email, password, options)
    └── kc-api.auth.js → KCSupabase.signUp()
         └── supabase-js: auth.signUp({ email, password })
              ├── Verifica domínio: @ufg.br | @discente.ufg.br | @egresso.ufg.br
              │   (validado no frontend via KC_ENV.auth.allowedEmailDomains)
              ├── Validação reforçada via trigger no banco
              ├── E-mail de confirmação enviado pelo Supabase
              └── profiles.verified = false até confirmação
```

### Callback de confirmação (`auth-callback.html`)

```
1. Usuário clica no link de e-mail → abre /auth-callback
   │
2. auth-callback.html carrega kc-auth-callback.js
   │
3. kc-auth-callback.js lê hash/params da URL
   └── supabase-js troca o token → obtém sessão válida
   └── Redireciona para homepage ou página destino
```

### Verificação de sessão (em qualquer página)

```javascript
// Em qualquer controller
const user = await KCAPI.getCurrentUser();
if (!user) {
  // Redirecionar para login
  window.location.href = '/login';
}
```

```
KCAPI.getCurrentUser()
    └── kc-api.auth.js → KCSupabase.getCurrentUser()
         └── supabase-js: auth.getUser()
              └── Valida JWT da sessão em localStorage
              └── Retorna { id, email, ... } ou null
```

---

## 6. Fluxo de notificações (Realtime)

### Subscrição (driver = 'supabase')

```
1. Usuário autenticado abre qualquer página com shell público
   │
2. kc-public-shell.js (ou kc-notifications.js) inicia subscrição:
   │   KCAPI.subscribeNotifications(userId, handleNotification)
   │
3. KCAPI.subscribeNotifications() → kc-api.notifications.js
   │
4. kc-api.notifications.js → driver.subscribeNotifications(userId, callback)
   │
5. supabase.notifications.adapter.js:
   │   client
   │     .channel('notifications:' + userId)
   │     .on('postgres_changes', {
   │       event: '*',
   │       schema: 'public',
   │       table: 'notifications',
   │       filter: 'user_id=eq.' + userId
   │     }, function(payload) {
   │       callback({
   │         eventType: payload.eventType,  // 'INSERT' | 'UPDATE' | 'DELETE'
   │         new: payload.new,
   │         old: payload.old,
   │       });
   │     })
   │     .subscribe()
   │
6. Quando ocorre evento no banco (ex: novo comentário):
   │   Trigger PostgreSQL → insere linha em notifications para user_id
   │   Supabase Realtime detecta a mudança (WAL / postgres_changes)
   │   Callback é disparado no browser
   │
7. Controller de notificações atualiza badge e lista
```

### Cancelamento

```javascript
const channel = KCAPI.subscribeNotifications(userId, callback);
// Ao sair da página ou logout:
KCAPI.unsubscribeNotifications(channel);
```

### Diagrama Realtime

```
Banco PostgreSQL
    └── INSERT INTO notifications (user_id, ...) ← trigger de evento
         │
         └── Supabase Realtime (WAL → websocket)
              │
              └── Browser (supabase-js SDK mantém WS aberto)
                   └── callback({ eventType: 'INSERT', new: {...} })
                        └── kc-notifications.js atualiza UI
```

---

## 7. Cache SWR

### Padrão Stale-While-Revalidate nos sub-adaptadores

KCAPI implementa um padrão de cache simples em sub-módulos para dados que não mudam a cada request:

```
Primeiro acesso:
  KCAPI.getCachedPostAnalytics(postId)
      └── Não há cache → KCAPI.refreshPostAnalytics(postId)
           └── supabase.posts-read.adapter.js → query ao banco
           └── Resultado armazenado em _cache[postId] com timestamp
           └── Retorna dados frescos

Segundo acesso (dentro do TTL):
  KCAPI.getCachedPostAnalytics(postId)
      └── Cache válido → retorna dados armazenados sem nova query

Invalidação manual:
  KCAPI.invalidatePostAnalyticsCache(postId)
      └── Remove entrada do _cache[postId]
      └── Próximo acesso busca dados frescos
```

### Métodos de cache por domínio

| Domínio | Getter | Refresher | Invalidador |
|---------|--------|-----------|-------------|
| Analytics de post | `getCachedPostAnalytics` | `refreshPostAnalytics` | `invalidatePostAnalyticsCache` |
| Comentários | `getCachedComments` | `refreshComments` | `invalidateCommentsCache` |

### Sessão de usuário (KCSupabase)

A sessão do usuário autenticado é gerenciada pelo SDK do Supabase:

```
supabase-js → persiste sessão em localStorage
    chave: sb-<project-ref>-auth-token
    conteúdo: { access_token, refresh_token, expires_at, user }

KCSupabase.getUser()   → retorna user da sessão em memória (sem rede)
KCSupabase.getClient() → retorna instância do cliente supabase-js (singleton)
```

---

## 8. Modo local (localStorage)

### Quando é usado

| Situação | Comportamento |
|----------|--------------|
| `KC_ENV.driver = 'local'` (desenvolvimento) | Todas as chamadas vão para local.adapter.js |
| Ausência de `KC_DRIVER` (build sem env var) | Fallback automático para 'local' |
| Produção com driver inválido | Erro logado + driver bloqueado |

### Fontes de dados locais

```
local.adapter.js
    │
    ├── LEITURA (posts, feed)
    │     └── getDatabaseRaw()
    │          └── fetchJSON('/data/database.json') ← arquivo de fixture
    │               └── normalizePost() em cada item
    │
    ├── LEITURA (localStorage)
    │     └── localStorage.getItem('kc_user_posts')
    │     └── localStorage.getItem('kc_notifications')
    │     └── localStorage.getItem('kc_saved')
    │     └── localStorage.getItem('kc_ratings')
    │
    └── ESCRITA
          └── localStorage.setItem('kc_user_posts', JSON.stringify([...]))
```

### Namespaces do localStorage (modo local)

| Chave | Conteúdo | Sub-adapter responsável |
|-------|----------|------------------------|
| `kc_user_posts` | Posts criados pelo usuário (mock) | `local.posts-write.adapter.js` |
| `kc_notifications` | Notificações locais | `local.notifications.adapter.js` |
| `kc_ratings` | Votos/ratings locais | `local.ratings.adapter.js` |
| `kc_saved` | Posts salvos localmente | `local.saved.adapter.js` |
| `sb-<ref>-auth-token` | Sessão Supabase (supabase-js) | supabase-js SDK |

### Migração local → Supabase (V8.1.5.4)

Quando o usuário tem posts no `kc_user_posts` (localStorage) e o driver muda para 'supabase', o módulo `kc-migrate.myposts.js` é carregado automaticamente por `kc-env.js`:

```
kc-env.js detecta driver = 'supabase'
    └── Injeta <script defer src="kc-migrate.myposts.js">
         └── Lê posts de localStorage
         └── Verifica quais já foram migrados (metadata.migratedToSupabase)
         └── Insere os pendentes no Supabase
         └── Marca os migrados (metadata.migratedToSupabase = true)
```

---

## 9. Regras de segurança no fluxo

### 9.1 Sanitização obrigatória antes de innerHTML

**Todo conteúdo de usuário** exibido via `innerHTML` DEVE ser passado por `KCUtils.escapeHtml()`.

```javascript
// ✅ CORRETO — obrigatório
el.innerHTML = '<h2>' + KCUtils.escapeHtml(post.titulo) + '</h2>';
el.innerHTML = '<p>' + KCUtils.escapeHtml(post.descricao) + '</p>';

// ❌ PROIBIDO — vulnerabilidade XSS
el.innerHTML = post.titulo;
el.innerHTML = '<p>' + descricao + '</p>';
```

`KCUtils.escapeHtml()` delega para `_KCU.string.escapeHtml()` (`kc-utils.string.js`) que escapa os caracteres: `&`, `<`, `>`, `"`, `'`.

### 9.2 Sem event handlers inline no HTML

```html
<!-- ❌ PROIBIDO -->
<button onclick="handleClick()">Publicar</button>

<!-- ✅ CORRETO -->
<button id="btn-publicar">Publicar</button>
<!-- No JS: document.getElementById('btn-publicar').addEventListener('click', handleClick); -->
```

Motivo: CSP (Content Security Policy) em produção bloqueia `unsafe-inline`. A violação é detectada pelo validator `check:hygiene`.

### 9.3 RLS no Supabase

Todas as tabelas possuem Row Level Security (RLS) ativa. Os adapters Supabase não precisam (e não devem) implementar filtragem de segurança — o banco filtra automaticamente:

| Política | Regra |
|----------|-------|
| `posts_select_published` | Somente posts com `status = 'published'` são visíveis publicamente |
| `posts_insert_authenticated` | Somente usuários com `profiles.verified = true` podem criar posts |
| `posts_update_owner` | Somente o `author_id` pode editar o próprio post |
| `reports_rate_limit` | Máximo de 5 reports por usuário por hora (trigger) |

### 9.4 Validação de domínio no registro

E-mails são validados em duas camadas:

1. **Frontend:** `KC_ENV.auth.allowedEmailDomains` = `['ufg.br', 'discente.ufg.br', 'egresso.ufg.br']`
2. **Banco (trigger):** A coluna `profiles.verified` é forçada a `false` por trigger até confirmação do e-mail com domínio válido

### 9.5 CSP e headers de segurança

Configurados em `vercel.json` para todos os responses:

```
Content-Security-Policy: script-src 'self' cdn.jsdelivr.net ...
                          (sem 'unsafe-inline')
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Consequência prática para desenvolvimento: qualquer `<script>` inline ou `eval()` lançará erro de CSP em produção.

---

## Referência rápida

### Chamadas KCAPI mais comuns

```javascript
// Feed com cursor (paginação incremental)
const { posts, nextCursor } = await KCAPI.getFeedCursor({
  module: 'eventos',   // 'eventos' | 'moradia' | 'oportunidades' | etc.
  sortBy: 'recentes',  // 'recentes' | 'relevantes'
  limit: 20,
  cursor: null,        // null = primeira página; nextCursor = próxima
});

// Busca full-text
const posts = await KCAPI.searchPosts({ q: 'moradia setor oeste', module: 'moradia', limit: 12 });

// Post individual
const post = await KCAPI.getPostById(postId);

// Criar publicação (requer auth)
const result = await KCAPI.createPost({ titulo, descricao, moduleDB, categoryDB, images });

// Login
const { user, error } = await KCAPI.signIn(email, password);

// Usuário atual (null se não autenticado)
const user = await KCAPI.getCurrentUser();

// Ranking
const contributors = await KCAPI.getTopContributors('month', 'moradia', 10);

// Notificações não lidas
const count = await KCAPI.getUnreadNotificationCount();

// Subscrição Realtime
const channel = KCAPI.subscribeNotifications(userId, callback);
KCAPI.unsubscribeNotifications(channel); // ao sair da página
```

### Onde cada parte do fluxo vive

| Componente | Arquivo | Namespace |
|-----------|---------|-----------|
| Configuração de ambiente + driver | `assets/js/boot/kc-env.js` | `window.KC_ENV` |
| Fachada pública KCAPI | `assets/js/api/kc-api.client.js` | `window.KCAPI` |
| Feed + paginação | `assets/js/api/kc-api.posts-feed.js` | `window._KCAPI.postsFeed` |
| Posts leitura + cache | `assets/js/api/kc-api.posts-read.js` | `window._KCAPI.postsRead` |
| Autenticação | `assets/js/api/kc-api.auth.js` | `window._KCAPI.auth` |
| Notificações | `assets/js/api/kc-api.notifications.js` | `window._KCAPI.notifications` |
| Diagnosticos create-post | `assets/js/api/kc-api.diagnostics.js` | `window._KCAPI.diagnostics` |
| Session cache/freshness | `assets/js/api/kc-api.session.js` | `window._KCAPI.session`, `window.KCSessionStore`, `window.KCPostFreshness` |
| Normalizacao de posts | `assets/js/api/kc-api.posts-normalize.js` | `window._KCAPI.postsNormalize` |
| Adapter local (facade) | `assets/js/adapters/local/local.adapter.js` | — |
| Adapter Supabase (facade) | `assets/js/adapters/supabase/supabase.adapter.js` | — |
| Cliente Supabase (auth + sessão) | `assets/js/api/kc-supabase-facade.js` | `window.KCSupabase` |
| Escape HTML | `assets/js/utils/kc-utils.js` | `window.KCUtils.escapeHtml` |
