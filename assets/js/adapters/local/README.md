# assets/js/adapters/local/

Driver "local" do padrão de adapter do KinoCampus — implementação baseada em `localStorage` e estado em memória.

## Arquivos (a mover em V14.8)

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `local.adapter.js` | `window.KCAPI` (registra `'local'`) | Registry/facade — registra `driverLocal` em `window.KCAPI.registerAdapter('local', ...)` |
| `local.posts-read.adapter.js` | `window._KCLA.postsRead` | Leitura e busca de posts em localStorage |
| `local.posts-write.adapter.js` | `window._KCLA.postsWrite` | Criação, edição e exclusão de posts |
| `local.ratings.adapter.js` | `window._KCLA.ratings` | Avaliações de usuários e posts |
| `local.saved.adapter.js` | `window._KCLA.saved` | Posts salvos pelo usuário |
| `local.notifications.adapter.js` | `window._KCLA.notifications` | Notificações locais |
| `local.profile.adapter.js` | `window._KCLA.profile` | Perfil de usuário em localStorage |
| `local.help.adapter.js` | `window._KCLA.help` | Central de ajuda e tickets |

## Regras de carregamento

- `local.adapter.js` DEVE ser carregado após `kc-api.client.js` (que expõe `window.KCAPI.registerAdapter`)
- Sub-módulos `local.*.adapter.js` carregados ANTES de `local.adapter.js`
- O namespace `window._KCLA` é inicializado pelo primeiro sub-módulo carregado
- Sem dependência circular entre sub-módulos

## Namespace

- Sub-módulos escrevem em `window._KCLA.<domain>` (sublinhado = interno)
- Facade principal: `window.KCAPI.registerAdapter('local', driverLocal)` — contrato público exposto por `kc-api.client.js`

## Status

**Movimentação planejada para V14.8.** Em V14 os arquivos permanecem em `assets/js/adapters/`. Este diretório é um placeholder para receber os arquivos na iteração v14.8.0.
