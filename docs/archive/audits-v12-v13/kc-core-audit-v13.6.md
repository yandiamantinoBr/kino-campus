# Auditoria — kc-core.js (v13.6.0)

**Data:** 2026-04-25  
**Versão:** v13.6.0 (doc-only)  
**Arquivo:** `assets/js/kc-core.js`

---

## 1. Footprint atual

| Métrica | Valor |
|---|---|
| Linhas | 1221L |
| Funções top-level | ~35 |
| Namespaces expostos | `window.KCPostModel`, `window.kcUserPosts`, `window.KCCore` |
| Deps externas | `KCAPI.normalizePost`, `vote()`, `refreshHeroCarousel()`, `kcInitVotesRealtime()` (via outros scripts) |

---

## 2. Grupos naturais de funções

### Grupo A — KCPostModel (~116L, linhas 1–116)
> `window.KCPostModel.from(raw, context)`

Fábrica de dados de post. Normaliza campos via `KCAPI.normalizePost`.
Lida com datas, badges, expiração, highlight. Totalmente autocontido.

### Grupo B — Mobile navigation + ripple + smooth anchors (~196L, linhas 117–312)
> `getMobileMenuElements`, `openMobileMenu`, `closeMobileMenu`, `toggleMobileMenu`
> `installRippleStylesOnce`, `createRipple`
> `initSmoothAnchors`, `initMobileNavActive`

Interações de UI básicas do shell. Sem dependências externas.

### Grupo C — User Posts / LocalStorage (~225L, linhas 313–537)
> `KC_USER_POSTS_KEY`, `kcLoadUserPosts`, `kcSaveUserPosts`, `kcCreateUserPost`
> `kcGetUserPostById`, `kcGetModuloFilterForPage`, `kcModuleLabel`, `kcModulePage`
> `kcInjectUserPostsIntoFeed`
> `window.kcUserPosts = { create, load, save, getById, inject }`

Camada de persistência local de posts (localStorage). Namespace público `window.kcUserPosts`.

### Grupo D — Responsive UX / Layout (~312L, linhas 538–849)
> `kcUpdateHeaderHeightVar`, `kcEnableDragToScroll`, `kcInitHorizontalDragAreas`
> `kcInitHeroSwipe`, `kcInitImageFallbacks`
> `kcIsMobileViewport`, `kcPolishCardsForMobile`
> `_kcClamp`, `kcApplyResponsiveVars`, `kcDebounce`

Helpers de layout e scroll. `kcDebounce` é utilitário genérico usado em vários grupos.

### Grupo E — WhatsApp Share (~157L, linhas 850–1006)
> `kcNormalizeShareUrl`, `kcResolveCardShareData`, `kcCreateWhatsAppShareButton`
> `kcEnsureCardActionsWrapper`, `kcInjectWhatsAppShareButtonsIntoCards`
> `kcOpenWhatsAppShare`, `kcInitWhatsAppShare`

Integração de compartilhamento via WhatsApp nos cards. Autocontido.

### Grupo F — Boot DOMContentLoaded (~93L, linhas 1007–1099)
> Orquestra: `initMobileNavActive`, `initSmoothAnchors`, `kcInitWhatsAppShare`, etc.
> Chama `vote()`, `refreshHeroCarousel()`, `kcInitVotesRealtime()` (definidos em outros scripts).

### Grupo G — Text Truncation IIFE (~46L, linhas 1100–1145)
> `kcTruncateText`, `kcApplyMobileTextTruncation`

IIFE autocontida para truncamento de texto em mobile.

### Grupo H — KCCore.bindModuleSortTabs IIFE (~75L, linhas 1147–1221)
> `window.KCCore.bindModuleSortTabs(opts)`

Widget de tabs de ordenação (Destaques/Recentes/Comentados) para páginas de módulo.
Autocontido exceto pela chamada de `opts.initFeedFn`.

---

## 3. Análise de dependências

| Grupo | Depende de |
|---|---|
| A (KCPostModel) | `KCAPI.normalizePost` (optional), `KC_ENV.clamp` |
| B (Mobile nav) | DOM apenas |
| C (User Posts) | `localStorage`, `kcModuleLabel`, `kcModulePage` (internos) |
| D (Layout) | DOM + CSS variables |
| E (WhatsApp) | DOM, `window.open` |
| F (Boot) | Todos os grupos acima + externos: `vote()`, `refreshHeroCarousel()`, `kcInitVotesRealtime()` |
| G (Text truncation) | DOM |
| H (bindModuleSortTabs) | DOM, `window.history` |

---

## 4. Nota sobre kc-render-card.js (plano original)

O plano inicial de V13 mencionava extrair `kc-render-card.js` (window.KCRenderCard).
A auditoria real constata que **não existe** lógica de renderização de cards em `kc-core.js`.
A renderização de cards está em `kc-utils.js` (KCUtils.renderPostCard), fora do escopo desta auditoria.

O split v13.6.1 adota a estratégia revisada abaixo.

---

## 5. Estratégia de split (v13.6.1)

### Problema: gate < 700L requer extração de ≥ 521L

| Extração | Linhas extraídas | Residual estimado |
|---|---|---|
| Apenas A (KCPostModel) | ~116L | ~1105L ✗ |
| A + C (PostModel + UserPosts) | ~341L | ~880L ✗ |
| A + C + E (+ WhatsApp) | ~498L | ~723L ✗ |
| A + C + E + H (+ SortTabs) | ~573L | ~648L ✓ |

**Recomendação:** extrair **Grupo A** + **Grupo C** + **Grupo E** + **Grupo H**:

### kc-post-model.js → `window.KCPostModel`
- Funções: `from(raw, context)` — fábrica de post normalizado
- Deps: `KCAPI.normalizePost` (chamado em runtime via `window.KCAPI`)
- **Estimativa:** ~120L

### kc-user-posts.js → `window.kcUserPosts`
- Funções: `kcLoadUserPosts`, `kcSaveUserPosts`, `kcCreateUserPost`, `kcGetUserPostById`,
  `kcGetModuloFilterForPage`, `kcModuleLabel`, `kcModulePage`, `kcInjectUserPostsIntoFeed`
- Deps: `localStorage`, globals KC_ENV-free
- **Estimativa:** ~230L

### Residual kc-core.js
- Mantém: Grupo B (mobile nav + ripple), Grupo D (layout/scroll), Grupo E pode ficar ou sair,
  Grupo F (boot), Grupo G (truncation), Grupo H (sortTabs)
- Residual estimado: **~648L < 700L** ✓

---

## 6. Padrão de extração

`kc-post-model.js` não usa IIFE — é um objeto global direto:
```javascript
// kc-post-model.js
window.KCPostModel = {
  from: function (raw, context) { ... }
};
```

`kc-user-posts.js` — IIFE com namespace:
```javascript
(function () {
  'use strict';
  // ... funções internas ...
  window.kcUserPosts = Object.freeze({ create, load, save, getById, inject });
})();
```

---

## 7. HTML consumidores

```bash
# Arquivos que carregam kc-core.js (verificar com grep):
grep -rl "kc-core.js" *.html admin/*.html
```

Após split, adicionar em cada HTML:
```html
<script defer src="assets/js/kc-post-model.js"></script>
<script defer src="assets/js/kc-user-posts.js"></script>
<script defer src="assets/js/kc-core.js"></script>
```
**Ordem**: sub-módulos ANTES do core (o core residual pode referenciar os objetos globais).

---

## 8. Gate formal (v13.6.2)

Meta: `kc-core.js` < **700L**

```bash
wc -l assets/js/kc-core.js
```

---

## 9. Testes a criar (v13.6.1)

**`tests/kc-core-split.test.js`**
- Contrato estático de `window.KCPostModel` (função `from` exportada)
- Contrato estático de `window.kcUserPosts` (funções exportadas)
- `kc-core.js` residual NÃO define `KCPostModel` inline
- Ordem de scripts nos HTMLs consumidores (sub-módulos antes do core)
- Gate de tamanho: `kc-core.js` < 700L
