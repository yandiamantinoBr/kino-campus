# KinoCampus — Arquitetura do Frontend

## Visão Geral

O KinoCampus é um site estático (HTML + CSS + JS) hospedado no Vercel com um backend Supabase. Não há bundler nem framework — cada página HTML inclui os scripts que precisa via `<script defer>`.

## Padrão Fundamental: IIFE + window.*

Todo módulo JS segue o padrão IIFE (Immediately Invoked Function Expression):

```javascript
(function () {
  'use strict';

  // Funções e estado PRIVADOS — não acessíveis de fora
  var _internalState = {};
  function _helper() { ... }

  // Interface PÚBLICA — exposta em window.*
  window.KCModuleName = {
    methodA: methodA,
    methodB: methodB,
  };

  // Inicialização automática no DOMContentLoaded
  document.addEventListener('DOMContentLoaded', init);
}());
```

**Por quê:** Sem bundler, o IIFE evita poluição de escopo global enquanto ainda permite comunicação entre módulos via `window.*`.

## Padrão Driver (Duplo Adapter)

O sistema suporta dois drivers de dados:

```
KC_ENV.driver === 'local'     → LocalAdapter (localStorage + data/database.json)
KC_ENV.driver === 'supabase'  → SupabaseAdapter (Supabase PostgreSQL)
```

Em **produção** (Vercel), `inject-env.js` substitui placeholders e força `driver = 'supabase'`.
Em **desenvolvimento local**, `driver = 'local'` permite trabalhar offline sem Supabase.

O `KCAPI` (kc-api.client.js) é a facade que delega para o adapter registrado:

```
Browser
  └─ KCAPI.getPosts(params)
       └─ adapter.getPosts(params)  ← supabase.adapter.js ou local.adapter.js
            └─ Supabase PostgreSQL (ou localStorage)
```

## Mapa de Dependências entre Módulos

### Camada 1 — Bootstrap (sem dependências)
- `kc-env.js` → expõe `window.KC_ENV` (config de ambiente)
- `kc-theme-boot.css` → CSS crítico anti-FOUC

### Camada 2 — Core (depende de KC_ENV)
- `kc-constants.js` → expõe `window.KC_CONSTANTS` (módulos, ODS, defaults)
- `kc-utils.js` → expõe `window.KCUtils` (~50 funções utilitárias)
- `kc-supabase.client.js` → expõe `window.KCSupabase` (cliente Supabase)

### Camada 3 — API (depende de Core)
- `kc-api.client.js` → expõe `window.KCAPI` (facade de todas as operações)
- `kc-profiles.client.js` → expõe `window.KCProfiles` (cache de perfis)
- Adapters:
  - `adapters/supabase.adapter.js`
  - `adapters/local.adapter.js`

### Camada 4 — Features (depende de KCAPI)
- `kc-auth.ui.js` → Modal de login/signup, sessão
- `kc-create-post.js` → Modal de criação de post (109KB — lazy load recomendado)
- `kc-comments.js` → Sistema de comentários
- `kc-search.js` → Busca com sinônimos
- `kc-ranking.js` → Ranking sidebar
- `kc-banners.js` → Hero carousel com banners do Supabase

### Camada 5 — Controllers de Página
- `controllers/product.controller.js` → Página de produto (`_product.html`)
- `controllers/admin-dashboard.controller.js` → Admin (`admin/index.html`)
- `controllers/compra-venda-feed.controller.js` → Feed compra-venda
- `controllers/caronas-feed.controller.js` → Feed caronas
- `controllers/eventos.controller.js` → Feed eventos
- `controllers/moradia.controller.js` → Feed moradia
- `controllers/achados-perdidos.controller.js` → Feed achados/perdidos
- `controllers/oportunidades.controller.js` → Feed oportunidades
- `controllers/my-posts.controller.js` → Meus posts
- `controllers/admin-banners.controller.js` → Admin banners
- `controllers/admin-moderation.controller.js` → Admin moderação
- `controllers/admin-reports.controller.js` → Admin reports
- `controllers/admin-help-requests.controller.js` → Admin help requests

## Fluxo de Dados — Criação de Post

```
1. Usuário clica "Criar Publicação"
2. kc-auth.ui.js verifica sessão → abre modal de login se não autenticado
3. kcOpenCreatePostModal() → modal do kc-create-post.js
4. Usuário preenche formulário (schema do módulo define campos)
5. Submit → KCAPI.createPost(body)
6. supabase.adapter.js → INSERT posts + INSERT post_media (upload storage)
7. Redirect para feed do módulo
```

## Fluxo de Dados — Visualização de Post

```
1. URL: _product.html?id={uuid}
2. product.controller.js DOMContentLoaded
3. KCAPI.getPostById(id) → SELECT posts + JOIN profiles + JOIN post_media
4. Renderiza: gallery, título, preço, descrição, seller card
5. KCAPI.getComments(id) → renderiza comentários
6. KCAPI.getRelatedPosts(id) → renderiza posts relacionados
7. KCAPI.getTopContributors() → sidebar ranking
```

## Fluxo de Autenticação

```
1. kc-auth.ui.js → Supabase Auth (signIn/signUp)
2. onAuthStateChange → kc:authchange event
3. KCProfiles.ensureSynced() → UPSERT profiles row
4. UI atualiza: botão perfil aparece, "Criar Publicação" habilitado
5. Sessão persistida em sessionStorage/localStorage pelo Supabase SDK
```

## Páginas HTML (22 total)

### Páginas de Módulo
| Arquivo | Propósito |
|---------|-----------|
| `index.html` | Homepage: banners, feed destaques, ranking, categorias |
| `compra-venda-feed.html` | Feed de compra e venda |
| `caronas-feed.html` | Feed de caronas |
| `eventos.html` | Feed de eventos |
| `moradia.html` | Feed de moradia |
| `achados-perdidos.html` | Feed de achados e perdidos |
| `oportunidades.html` | Feed de oportunidades |

### Páginas de Produto e Perfil
| Arquivo | Propósito |
|---------|-----------|
| `_product.html` | Detalhe de qualquer post (parâmetro `?id=`) |
| `profile.html` | Perfil de usuário (parâmetro `?user=`) |
| `my-posts.html` | Posts do usuário logado |
| `settings.html` | Configurações de conta |
| `account-setup.html` | Onboarding inicial |

### Páginas Utilitárias
| Arquivo | Propósito |
|---------|-----------|
| `create-post.html` | Entry point para criação de post |
| `search-results.html` | Resultados de busca |
| `auth-callback.html` | Callback OAuth |
| `ajuda.html` | FAQ e suporte |
| `ods.html` | Showcase dos ODS (Objetivos de Desenvolvimento Sustentável) |

### Admin
| Arquivo | Propósito |
|---------|-----------|
| `admin/index.html` | Dashboard com KPIs |
| `admin/banners.html` | Gestão de banners |
| `admin/moderation.html` | Moderação de conteúdo |
| `admin/reports.html` | Reports de usuários |
| `admin/help-requests.html` | Tickets de suporte |

## Arquitetura CSS

| Arquivo | Tamanho | Propósito |
|---------|---------|-----------|
| `assets/css/styles.css` | ~10k linhas | Design system global (tema, layout, componentes) |
| `assets/css/product.css` | ~1.4k linhas | Estilos específicos da página de produto |
| `assets/css/kc-public-shell.css` | ~833 linhas | Perfil e páginas compartilhadas |
| `assets/css/admin-shell.css` | ~510 linhas | Grid e cards do admin |
| `assets/css/kc-theme-boot.css` | ~213 linhas | CSS crítico anti-FOUC (carrega primeiro) |

## OG Image System

Função serverless Vercel em `api/og-image.js` usando `@vercel/og` + Satori.

```
GET /api/og-image?type=eventos
  → gera PNG 1200×630 com brand KinoCampus + cores do módulo
```

Tipos suportados: `home`, `compra-venda`, `eventos`, `moradia`, `caronas`, `oportunidades`, `achados-perdidos`, `ajuda`, `product`

## Injeção de Variáveis de Ambiente (Build Time)

`scripts/inject-env.js` substitui placeholders em `kc-env.js` durante o build do Vercel:

```
__KC_SUPABASE_URL__  → SUPABASE_URL (env var do Vercel)
__KC_SUPABASE_ANON_KEY__ → SUPABASE_ANON_KEY
__KC_DRIVER__ → 'supabase'
```

O script valida formato (HTTPS, JWT), falha o build se placeholders não foram substituídos.
