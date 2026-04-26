# assets/js/api/

Camada de API: facade principal, sub-módulos de domínio e cliente Supabase.

## Arquivos planejados

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `kc-api.client.js` | `window.KCAPI` | Registry/facade — delega para sub-módulos |
| `kc-api.auth.js` | `window._KCAPI.auth` | Autenticação via KCAPI |
| `kc-api.posts-read.js` | `window._KCAPI.postsRead` | Leitura de posts |
| `kc-api.posts-write.js` | `window._KCAPI.postsWrite` | Escrita/publicação de posts |
| `kc-api.comments-votes.js` | `window._KCAPI.commentsVotes` | Comentários e votos |
| `kc-api.notifications.js` | `window._KCAPI.notifications` | Notificações |
| `kc-api.profiles.js` | `window._KCAPI.profiles` | Perfis de usuário |
| `kc-api.ratings.js` | `window._KCAPI.ratings` | Avaliações |
| `kc-api.related.js` | `window._KCAPI.related` | Posts relacionados |
| `kc-api.saved.js` | `window._KCAPI.saved` | Posts salvos |
| `kc-api.help.js` | `window._KCAPI.help` | Central de ajuda |
| `kc-supabase.client.js` | `window.KCSupabase` | Cliente Supabase + facade |
| `kc-supabase.posts.js` | `window.KCSupabase._posts` | Posts via Supabase |
| `kc-supabase.ratings.js` | `window.KCSupabase._ratings` | Ratings via Supabase |
| `kc-profiles.client.js` | `window.KCProfilesClient` | Perfis via Supabase |

## Regras
- `kc-supabase.client.js` ANTES dos sub-módulos supabase
- Sub-módulos `kc-api.*.js` carregados APÓS `kc-api.client.js`
- `kc-api.client.js` não pode ser reduzido abaixo de 700L (é registry/facade)

## Status
**Planejado para V15.** Em V14 os arquivos permanecem em `assets/js/`.
