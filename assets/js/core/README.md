# assets/js/core/

Módulos do núcleo da aplicação: UI shell, modelo de dados, widgets reutilizáveis e autenticação.

## Arquivos atuais

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `kc-core.js` | `window.KCCore` | Shell mobile, scroll, layout, boot DOMContentLoaded |
| `kc-core-widgets.js` | `window.KCCore.initWhatsAppShare`, `window.KCCore.bindModuleSortTabs`, `window.KCCore.initMobileTextTruncation`, `window.KCCore.initHeaderWordmarkFit` | WhatsApp share, sort tabs, compactação textual móvel e ajuste do wordmark ao espaço disponível |
| `kc-post-model.js` | `window.KCPostModel` | Fábrica de modelo de post normalizado |
| `kc-user-posts.js` | `window.kcUserPosts` | Posts de usuário em localStorage |
| `kc-auth.ui.js` | — | UI de autenticação (modais de login/signup) |
| `kc-auth-callback.js` | — | Handler de callback OAuth |
| `kc-i18n.js` | `window.KCi18n` | Dicionario e runtime i18n |
| `kc-notifications.js` | `window.KCNotifications` | UI de notificacoes in-app |
| `kc-profiles.client.js` | `window.KCProfilesClient` | Cliente de perfis via Supabase |
| `kc-public-shell.js` | `window.KCPublicShell` | Shell publico compartilhado |
| `kc-theme.js` | `window.KCTheme` | Tema e persistencia de preferencia visual |

## Regras
- Carregado após `boot/` e antes de `api/`
- `kc-post-model.js`, `kc-user-posts.js`, `kc-core-widgets.js` ANTES de `kc-core.js`
- Sem referência direta a adapters

## Status
**Consolidado desde V15.** Os arquivos ja residem em `assets/js/core/` e fazem parte do `CANONICAL_JS`.
