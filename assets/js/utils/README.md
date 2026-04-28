# assets/js/utils/

Sub-módulos de utilitários, carregados em ordem determinística antes de `kc-utils.js`.

## Arquivos atuais

| Arquivo | Namespace | Responsabilidade |
|---|---|---|
| `kc-utils.string.js` | `window._KCU.string` | Normalização de texto, escape HTML, slugify |
| `kc-utils.format.js` | `window._KCU.format` | Formatação de datas, preços, números |
| `kc-utils.dom.js` | `window._KCU.dom` | Debounce, clipboard, scroll helpers |
| `kc-utils.identity.js` | `window._KCU.identity` | Geração de IDs, fingerprint |
| `kc-utils.taxonomy.js` | `window._KCU.taxonomy` | Categorias, tags, módulos |
| `kc-utils.location.js` | `window._KCU.location` | Geolocalização, endereços |
| `kc-utils.presentation.js` | `window._KCU.presentation` | Renderização de cards, badges, avatares |
| `kc-utils.js` | `window.KCUtils` | Facade — re-exporta todos os sub-módulos |

## Regras de carregamento
- Sub-módulos em ordem antes de `kc-utils.js`
- `kc-utils.js` deve carregar APÓS todos os sub-módulos
- Sem dependência circular entre sub-módulos

## Status
**Consolidado desde V14.7/V15.** Os arquivos ja residem em `assets/js/utils/`, sao carregados em ordem deterministica nos 22 HTMLs e fazem parte do `CANONICAL_JS`.
