# assets/js/core/

Módulos do núcleo da aplicação: UI shell, modelo de dados, widgets reutilizáveis e autenticação.

## Arquivos planejados

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `kc-core.js` | `window.KCCore` | Shell mobile, scroll, layout, boot DOMContentLoaded |
| `kc-core-widgets.js` | `window.KCCore.initWhatsAppShare`, `window.KCCore.bindModuleSortTabs` | WhatsApp share + sort tabs |
| `kc-post-model.js` | `window.KCPostModel` | Fábrica de modelo de post normalizado |
| `kc-user-posts.js` | `window.kcUserPosts` | Posts de usuário em localStorage |
| `kc-auth.ui.js` | — | UI de autenticação (modais de login/signup) |
| `kc-auth-callback.js` | — | Handler de callback OAuth |

## Regras
- Carregado após `boot/` e antes de `api/`
- `kc-post-model.js`, `kc-user-posts.js`, `kc-core-widgets.js` ANTES de `kc-core.js`
- Sem referência direta a adapters

## Status
**Planejado para V15.** Em V14 os arquivos permanecem em `assets/js/`.
