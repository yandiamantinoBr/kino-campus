# KinoCampus - Arquitetura do Frontend

## Visão geral

O KinoCampus continua operando como aplicação estática hospedada na Vercel, com backend Supabase e sem bundler. Cada página HTML carrega explicitamente os scripts de que precisa via `<script defer>`, e a composição entre módulos acontece por meio de IIFEs e contratos expostos em `window.*`.

## Estado atual do repositório

| Item | Quantidade atual |
|------|------------------|
| páginas HTML públicas na raiz | `17` |
| páginas HTML administrativas | `5` |
| total de páginas HTML | `22` |
| arquivos JS em `assets/js` | `61` |
| controllers em `assets/js/controllers` | `23` |
| adapters em `assets/js/adapters` | `2` |
| componentes em `assets/js/components` | `3` |
| arquivos CSS em `assets/css` | `5` |
| arquivos de teste em `tests` | `26` |
| migrations em `supabase/migrations` | `77` |

## Princípio estrutural

### IIFE + `window.*`

Cada módulo JavaScript segue o padrão:

```javascript
(function () {
  'use strict';

  function helperPrivado() {}

  window.KCModule = {
    metodoPublico: metodoPublico,
  };

  document.addEventListener('DOMContentLoaded', init);
}());
```

Esse modelo preserva encapsulamento local sem depender de bundler e mantém interoperabilidade entre páginas carregadas de forma incremental.

### Driver pattern

O frontend fala sempre com a fachada `KCAPI`, que delega para um dos adapters:

```text
Browser -> KCAPI -> LocalAdapter | SupabaseAdapter -> origem dos dados
```

- `KC_ENV.driver === 'local'`: usa `local.adapter.js`
- `KC_ENV.driver === 'supabase'`: usa `supabase.adapter.js`

Em produção, o build `node scripts/inject-env.js` injeta os valores e força o caminho Supabase.

## Camadas do app

### Camada 1 - bootstrap

- `assets/js/kc-env.js`
- `assets/css/kc-theme-boot.css`
- `assets/js/kc-theme-boot.js`

### Camada 2 - core compartilhado

- `assets/js/kc-constants.js`
- `assets/js/kc-utils.js`
- `assets/js/kc-supabase.client.js`
- `assets/js/kc-api.client.js`
- `assets/js/kc-profiles.client.js`

### Camada 3 - features compartilhadas

- `assets/js/kc-auth.ui.js`
- `assets/js/kc-create-post.js`
- `assets/js/kc-comments.js`
- `assets/js/kc-search.js`
- `assets/js/kc-ranking.js`
- `assets/js/kc-banners.js`
- `assets/js/kc-lazy-loader.js`
- `assets/js/kc-notifications.js`
- `assets/js/admin-shell.js`

### Camada 4 - controllers de página

Públicos:

- `compra-venda-feed.controller.js`
- `caronas-feed.controller.js`
- `moradia.controller.js`
- `eventos.controller.js`
- `oportunidades.controller.js`
- `achados-perdidos.controller.js`
- `product.controller.js`
- `profile.controller.js`
- `my-posts.controller.js`

Admin:

- `admin-dashboard.controller.js`
- `admin-moderation.controller.js`
- `admin-reports.controller.js`
- `admin-banners.controller.js`
- `admin-help-requests.controller.js`
- `admin-invite.controller.js`

## Fluxos principais

### Criação de publicação

```text
UI -> kc-auth.ui.js -> kc-create-post.js -> KCAPI.createPost()
   -> adapter ativo -> Supabase/local
```

Pontos sensíveis:

- schema dinâmico por módulo
- upload e ordenação de mídia
- validação visual e sanitização
- limitação de posts/flood control

### Feed incremental

```text
Controller do módulo -> KCAPI.getFeedCursor()
                      -> adapter -> RPC kc_get_feed_cursor()
```

Pontos sensíveis:

- cursor opaco
- envelopes de filtros avançados
- consistência entre módulos equivalentes
- fallback local e paginação incremental

### Produto

```text
_product.html -> product.controller.js
              -> KCAPI.getPostById()
              -> comentários / relacionados / analytics / saves / share / agenda
```

Pontos sensíveis:

- grande concentração de UI e regras de negócio
- comentários lazy-loaded
- popovers, modais, related posts, analytics e tracking
- acoplamento forte com `styles.css` e `product.css`

### Admin v10

```text
admin/*.html -> admin-shell.js + controller específico
             -> KCAPI/admin adapters/RPCs
```

A linha v10 consolidou:

- navegação admin unificada
- dashboard com filtros/exports endurecidos
- moderação com busca server-side
- reports com paginação progressiva
- help requests com paginação server-side
- convites externos mais defensivos
- responsividade concentrada em `admin-shell.css`

## Hotspots técnicos

| Área | Arquivo | Tamanho aprox. | Risco |
|------|---------|----------------|-------|
| adapter dominante | `assets/js/adapters/supabase.adapter.js` | `147.1 KB` | alto acoplamento com banco, RLS, RPCs e normalização |
| detalhe de publicação | `assets/js/controllers/product.controller.js` | `138.7 KB` | UI crítica e muito estado compartilhado |
| criação de publicação | `assets/js/kc-create-post.js` | `108.4 KB` | formulário central, schemas dinâmicos, upload, validação |
| utilitários globais | `assets/js/kc-utils.js` | `96.2 KB` | impacto transversal amplo |
| admin dashboard | `assets/js/controllers/admin-dashboard.controller.js` | `91.4 KB` | KPIs, ranking, audit log e export |
| fachada de API | `assets/js/kc-api.client.js` | `90.8 KB` | compatibilidade entre drivers e contrato público |
| design system global | `assets/css/styles.css` | `235.4 KB` | alto risco de regressão visual transversal |

## Arquitetura CSS

| Arquivo | Tamanho aprox. | Papel |
|---------|----------------|-------|
| `assets/css/styles.css` | `235.4 KB` | base global de layout, componentes e tema |
| `assets/css/product.css` | `43.4 KB` | especificidades da página de produto |
| `assets/css/admin-shell.css` | `26.3 KB` | shell e responsividade do admin |
| `assets/css/kc-public-shell.css` | `16.8 KB` | páginas públicas compartilhadas e superfícies de perfil |
| `assets/css/kc-theme-boot.css` | `5.6 KB` | CSS crítico anti-FOUC |

## Regras de equivalência

Quando um padrão compartilhado é alterado, o mínimo esperado de revisão é:

- feeds públicos: os 6 módulos equivalentes
- admin: todos os `admin/*.html`, `admin-shell.js`, `admin-shell.css` e controllers tocados
- adapters: `local.adapter.js`, `supabase.adapter.js` e `kc-api.client.js`
- produto: `_product.html`, `product.controller.js`, `product.css` e utilitários acionados por popovers/modais
- documentação: `README.md`, `CHANGELOG.md`, docs afetadas e `RELATORIO-KINOCAMPUS-V11.md`

## Observações de baseline

- O repositório já está funcionalmente na linha `v10`, mas ainda carrega artefatos de versionamento embutido em `8.6.0` dentro de parte do frontend.
- A v11 começa pela correção de drift documental e pela explicitação desses pontos antes de qualquer refactor de alto risco.
