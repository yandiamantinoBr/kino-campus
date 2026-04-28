# assets/js/adapters/supabase/

Driver "supabase" do padrão de adapter do KinoCampus — implementação baseada no cliente Supabase (`window.KCSupabase`).

## Arquivos atuais

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `supabase.adapter.js` | `window.KCAPI` (registra `'supabase'`) | Registry/facade — registra `driverSupabase` em `window.KCAPI.registerAdapter('supabase', ...)` |
| `supabase.posts-read.adapter.js` | `window._KCSA.postsRead` | Leitura e busca de posts via Supabase |
| `supabase.posts-write.adapter.js` | `window._KCSA.postsWrite` | Criação, edição e exclusão de posts |
| `supabase.profiles.adapter.js` | `window._KCSA.profiles` | Perfis de usuário via Supabase |
| `supabase.notifications.adapter.js` | `window._KCSA.notifications` | Notificações via Supabase Realtime |
| `supabase.saved.adapter.js` | `window._KCSA.saved` | Posts salvos pelo usuário |
| `supabase.comments.adapter.js` | `window._KCSA.comments` | Comentários e respostas |
| `supabase.votes.adapter.js` | `window._KCSA.votes` | Votos em comentários e posts |
| `supabase.media.adapter.js` | `window._KCSA.media`, `window.KCCompressImage` | Upload e compressão de mídia (Storage) |
| `supabase.admin.adapter.js` | `window._KCSA.admin` | Operações administrativas |
| `supabase.analytics.adapter.js` | `window._KCSA.analytics` | Telemetria e eventos de analytics |

## Regras de carregamento

- `supabase.adapter.js` DEVE ser carregado após `kc-api.client.js` e `kc-supabase.client.js`
- Sub-módulos `supabase.*.adapter.js` carregados ANTES de `supabase.adapter.js`
- `supabase.media.adapter.js` expõe `window.KCCompressImage` além do namespace `_KCSA`
- O namespace `window._KCSA` é inicializado pelo primeiro sub-módulo carregado

## Namespace

- Sub-módulos escrevem em `window._KCSA.<domain>` (sublinhado = interno)
- Facade principal: `window.KCAPI.registerAdapter('supabase', driverSupabase)` — contrato público exposto por `kc-api.client.js`

## Status

**Consolidado desde V14.8/V15.** Os arquivos ja residem em `assets/js/adapters/supabase/` e fazem parte do `CANONICAL_JS`. Este README descreve o estado atual, nao um plano de movimentacao.
