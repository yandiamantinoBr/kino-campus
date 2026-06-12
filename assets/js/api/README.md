# assets/js/api/

Camada de API: facade principal, sub-módulos de domínio e cliente Supabase.

## Arquivos atuais

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `kc-api.client.js` | `window.KCAPI` | Registry/facade — delega para sub-módulos |
| `kc-api.auth.js` | `window._KCAPI.auth` | Autenticação via KCAPI |
| `kc-api.posts-feed.js` | `window._KCAPI.postsFeed` | Feed incremental e listagens |
| `kc-api.posts-read.js` | `window._KCAPI.postsRead` | Leitura de posts |
| `kc-api.posts-write.js` | `window._KCAPI.postsWrite` | Escrita/publicação de posts |
| `kc-api.comments-votes.js` | `window._KCAPI.commentsVotes` | Comentários e votos |
| `kc-api.notifications.js` | `window._KCAPI.notifications` | Notificações |
| `kc-api.profiles.js` | `window._KCAPI.profiles` | Perfis de usuário |
| `kc-api.ratings.js` | `window._KCAPI.ratings` | Avaliações |
| `kc-api.related.js` | `window._KCAPI.related` | Posts relacionados |
| `kc-api.saved.js` | `window._KCAPI.saved` | Posts salvos |
| `kc-api.diagnostics.js` | `window._KCAPI.diagnostics` | Diagnosticos de create-post |
| `kc-api.session.js` | `window._KCAPI.session`, `window.KCSessionStore`, `window.KCPostFreshness` | Cache de sessao e freshness de posts |
| `kc-api.filters.js` | `window._KCAPI.filters` | Filtros avancados e date presets de `KCAPI.filterPosts` |
| `kc-api.help.js` | `window._KCAPI.help` | Central de ajuda |
| `kc-supabase.client.js` | `window.KCSupabase` | Cliente Supabase + facade |
| `kc-supabase.posts.js` | `window.KCSupabase._posts` | Posts via Supabase |
| `kc-supabase.ratings.js` | `window.KCSupabase._ratings` | Ratings via Supabase |
| `admin-shell.js` | `window.KCAdminShell` | Shell compartilhado das paginas admin |

## Regras
- `kc-supabase.client.js` ANTES dos sub-módulos supabase
- Sub-módulos `kc-api.*.js` carregados ANTES de `kc-api.client.js`
- `kc-api.client.js` não pode ser reduzido abaixo de 700L (é registry/facade)

## Status
**Consolidado desde V15.** Os arquivos ja residem em `assets/js/api/`, sao carregados via `<script defer>` e fazem parte do `CANONICAL_JS` quando aplicavel.
