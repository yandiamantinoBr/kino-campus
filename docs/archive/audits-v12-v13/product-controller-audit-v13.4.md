# Auditoria — product.controller.js (v13.4.0)

**Data:** 2026-04-25  
**Versão:** v13.4.0 (doc-only)  
**Arquivo:** `assets/js/controllers/product.controller.js`

---

## 1. Footprint atual

| Métrica | Valor |
|---|---|
| Linhas | 1494L |
| Tamanho | 61 573 bytes |
| Funções top-level | 58 (4 async) |
| HTML consumidor | `_product.html` (único) |
| Sub-módulos existentes | 8: analytics, calendar, edit, popovers, ratings, related, report, save |
| Export público | `window._KCProduct.*` (namespace compartilhado com sub-módulos) |

---

## 2. Grupos naturais de funções

### Grupo A — Utilitários (~80L)
> `getParam`, `esc`, `moduleLabel`, `formatCurrency`, `setText`, `setHTML`, `show`, `hide`, `toast`, `buildCurrentPagePath`, `buildPostContactIntent`, `buildProfileHref`, `isViewerAuthenticated`, `resolveCurrentUserDisplayName`, `resolveCurrentUserAvatar`, `resolveCurrentUserLogin`

### Grupo B — CTA / Contato (~270L)
> `getContactActionPresentation`, `executeContactAction`, `getPostContactAction`, `setCTA`, `maybeResumeQueuedContact`, `applyCommentComposerSessionState`, `CATEGORY_GROUP_MAP`, `wireCreateSimilarBtn`, `normalizeWhatsAppPhone`, `getPostContactActionLegacy`, `reportCtaError`, `setCTALegacy`

### Grupo C — Binding / UI (~85L)
> `bindStaticInteractions` (linhas 458–542)

### Grupo D — Render de dados (~560L)
> `showNotFound`, `setBreadcrumb`, `setBadges`, `isLegacyExamplePost`, `isLegacyExampleProfile`, `buildLegacyExampleBadgeHtml`, `syncLegacyExampleMarker`, `setGallery`, `setPrice`, `setDescription` (×2), `addSpec` (×2), `addSpecHtml`, `setSpecs` (×2), `buildTagEntries`, `buildTagsSpecHtml`, `setOpenGraphTags`, `setLegacyBanner`, `setSeller`, `loadSellerAuthorStats`, `enrichPostAuthorFromProfile`

### Grupo E — Load / Lifecycle (~200L)
> `refreshViewerState`, `isAuthor`, `getPostIdForMutation`, `renderPost`, `loadPost`, `trackHomeCategoryInteraction`

### Grupo F — Estado e init (~30L)
> Variáveis de estado (`currentPost`, `currentUser`, `currentProfile`, `staticInteractionsBound`, `shared`, `sellerStatsRequestToken`), stubs de sub-módulos, `DOMContentLoaded`

---

## 3. Análise de dependências

O controller acessa estes globals de forma direta:
- `window.KCAPI` — getPostById, normalizePost, trackView
- `window.KCPostModel` — from()
- `window.KCUtils` — escapeHtml, getModuleLabel, formatCurrencyBRL
- `window.KCAccountProfileUtils` — shared
- `window.KCLazyLoader` — load (para kc-comments.js)
- `window.showToast` — toast
- `window._KCProduct.popovers/save/edit/analytics/ratings/report` — stubs e chamadas

Todas as dependências são injetadas via `window.*` — padrão canônico do projeto.

---

## 4. Estratégia de split (v13.4.1)

### product.load.js → `window._KCProduct.load`
Extrair **Grupo E** completo + funções de suporte de loadPost:
- `refreshViewerState`, `isAuthor`, `getPostIdForMutation`
- `renderPost`, `loadPost`
- `loadSellerAuthorStats`, `enrichPostAuthorFromProfile`
- `trackHomeCategoryInteraction`

**Estimativa:** ~200–250L extraídos → `product.load.js` ~200L

### product.render.js → `window._KCProduct.render`
Extrair **Grupo D** de renderização:
- `showNotFound`, `setBreadcrumb`, `setBadges`
- `isLegacyExamplePost`, `isLegacyExampleProfile`, `buildLegacyExampleBadgeHtml`, `syncLegacyExampleMarker`
- `setGallery`, `setPrice`, `setDescription` (×2), `addSpec` (×2), `addSpecHtml`, `setSpecs` (×2)
- `buildTagEntries`, `buildTagsSpecHtml`, `setOpenGraphTags`, `setLegacyBanner`, `setSeller`

**Estimativa:** ~400–450L extraídos → `product.render.js` ~450L

### Controller residual (orchestrator)
Mantém: **Grupos A + B + C + F** + wrappers finos para `_KCProduct.load` e `_KCProduct.render`

**Estimativa residual:** 1494 - 200 - 450 = **~844L → reduzir para < 800L** via remoção de comentários e consolidação de helpers

> **Nota:** O plano original (v13.4.1) menciona apenas product.load.js + product.ui.js.
> O audit recomenda incluir product.render.js para garantir meta < 800L.
> product.render.js assume o papel de "product.ui.js" do plano.

---

## 5. HTML consumidor

**`_product.html`** — carregamento atual (linhas 396–404):
```html
<script defer src="assets/js/controllers/product.controller.js"></script>
<script defer src="assets/js/controllers/product.report.js"></script>
<script defer src="assets/js/controllers/product.related.js"></script>
<script defer src="assets/js/controllers/product.calendar.js"></script>
<script defer src="assets/js/controllers/product.save.js"></script>
<script defer src="assets/js/controllers/product.ratings.js"></script>
<script defer src="assets/js/controllers/product.edit.js"></script>
<script defer src="assets/js/controllers/product.analytics.js"></script>
<script defer src="assets/js/controllers/product.popovers.js"></script>
```

**Pós-split (v13.4.1):**
```html
<script defer src="assets/js/controllers/product.controller.js"></script>
<script defer src="assets/js/controllers/product.render.js"></script>
<script defer src="assets/js/controllers/product.load.js"></script>
<script defer src="assets/js/controllers/product.report.js"></script>
<!-- restante inalterado -->
```

---

## 6. Gate formal (v13.4.2)

Meta: `product.controller.js` < **800L**

Validar com:
```bash
wc -l assets/js/controllers/product.controller.js
```

---

## 7. Testes a criar (v13.4.1)

**`tests/product-controller-split.test.js`**
- Contrato estático de `window._KCProduct.load` (funções exportadas)
- Contrato estático de `window._KCProduct.render` (funções exportadas)
- Ordem de scripts em `_product.html` (load após controller)
- Gate de tamanho: controller.js < 800L
