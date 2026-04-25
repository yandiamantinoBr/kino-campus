# Auditoria `assets/js/kc-utils.js` — v12.1.0

**Data:** 20 de abril de 2026
**Versão atual do módulo:** `V8.1.2.4.6` (declarada no header)
**Iteração:** `v12.1.0` (doc-only)
**Linha-base:** `kinocampus-V11.0-foundations` pós-`v11.33.7`
**Objetivo desta auditoria:** mapear o estado atual de `kc-utils.js` (2 445 linhas, ~100 KB) antes dos splits incrementais previstos em `v12.2.0`–`v12.2.6`, produzindo o inventário funcional completo, a análise de consumers, o plano de decomposição em sub-módulos `window._KCU.*` e a matriz de risco por domínio.

---

## 1. Footprint real

| Métrica | Valor |
|---|---|
| Linhas totais | **2 445L** |
| Tamanho no disco | **~101 716 bytes (~100 KB)** |
| Funções top-level | **~95 funções** (todas dentro da IIFE) |
| Métodos públicos exportados | **42** (via `window.KCUtils = Object.freeze({...})` em L2402–L2443) |
| Dependências externas | `window.KC_CONSTANTS` (desestruturada nas linhas L11–L20) |
| Wrappers IIFE | 1 (abre em L8, fecha em L2445) |
| HTMLs que carregam o asset | **17 páginas** |
| Arquivos JS consumidores (via `KCUtils.*`) | **30 arquivos** em `assets/js/` e `assets/js/controllers/` |
| Ocorrências totais de `KCUtils.*` em assets | **136+ chamadas** (pelo menos 1 método exportado por consumer) |
| Arquivos de teste já existentes | **3** (`kc-utils.test.js` 66L, `kc-utils-expanded.test.js` 431L, `kc-utils-resolvers.test.js` 609L; total 1 106L de testes) |

---

## 2. Estrutura interna (mapa por domínio)

O arquivo agrupa seus ~95 funções em **7 domínios lógicos naturais**, que servirão de base para os splits de `v12.2.0`–`v12.2.6`. A ordem de declaração respeita grosseiramente a ordem de dependência (utilitários puros primeiro, renderização no fim).

### 2.1. Domínio **string/text** (`string`) — ~180L

Utilitários de manipulação textual, sanitização, markdown, fuzzy matching. Puros (zero side-effect), sem dependência de DOM.

| Função | Linha | Pública? | Observações |
|---|---|---|---|
| `titleCase(str)` | L22 | ✓ | Capitaliza primeira letra de cada palavra |
| `beautifyKey(key)` | L59 | ✓ | Converte snake_case → Title Case |
| `normalizeText(str)` | L91 | ✓ | Normaliza acentos/case para busca (uso mais comum no repo) |
| `slugifyText(str)` | L137 | ✓ | Converte texto em slug URL-safe |
| `levenshteinDistance(a, b)` | L148 | ✗ | Helper interno de fuzzy matching |
| `escapeHtml(str)` | L1495 | ✓ | Escape HTML (usado massivamente pelos controllers) |
| `cssEscape(str)` | L1504 | ✗ | Escape de seletor CSS (não exportado) |
| `renderMarkdownInline(raw)` | L2366 | ✓ | Markdown inline limitado (links, bold, italic, código) |

### 2.2. Domínio **format** (`format`) — ~120L

Formatação de data, moeda, número, URL. Puros, sem DOM.

| Função | Linha | Pública? | Observações |
|---|---|---|---|
| `timeAgo(dateString)` | L31 | ✓ | "há X minutos/horas/dias" pt-BR (muito usado) |
| `formatCurrencyBRL(value)` | L1509 | ✗ | Formato BRL via `Intl.NumberFormat` (**não exportado**) |
| `parseBRLNumber(input)` | L1521 | ✗ | Parse "R$ 1.234,56" → número (**não exportado**) |
| `clamp(n, min, max)` | L1531 | ✓ | Clamp numérico simples |
| `splitPriceText(text)` | L1637 | ✓ | Separa símbolo monetário do valor |
| `buildProductDetailHref(postId)` | L1543 | ✓ | Constrói `_product.html?id=...` canônico |
| `getConditionLabel(raw)` | L1629 | ✓ | Mapeia enum de condição do item → rótulo humano |

> ⚠️ `formatCurrencyBRL` e `parseBRLNumber` são privadas. Split deve preservar essa visibilidade (ou promover a públicas se a auditoria revelar consumers via closure — hoje só internas).

### 2.3. Domínio **dom/async** (`dom`) — ~100L

DOM helpers, clipboard, debounce, detecção de campos selecionáveis.

| Função | Linha | Pública? | Observações |
|---|---|---|---|
| `debounce(fn, wait=120)` | L1535 | ✓ | Debounce clássico (consumers: filtros, busca) |
| `canSelectInputLike(target)` | L1549 | ✗ | Detecta se elemento é input editável |
| `fallbackCopyText(text, options)` | L1555 | ✗ | Fallback `document.execCommand('copy')` (v11.13.1) |
| `copyTextToClipboard(text, options)` | L1611 | ✓ (async) | Clipboard API + fallback, usado em product.controller e settings |

### 2.4. Domínio **identity/email/handle** (`identity`) — ~60L

Normalização e validação de e-mail institucional, handle público.

| Função | Linha | Pública? | Observações |
|---|---|---|---|
| `normalizeEmail(email)` | L100 | ✓ | Lowercase + trim |
| `getEmailDomain(email)` | L104 | ✓ | Extrai domínio |
| `normalizeAllowedDomains(allowedDomains)` | L111 | ✓ | Normaliza lista de domínios |
| `isInstitutionalEmailAllowed(email, allowedDomains)` | L120 | ✓ | Valida contra allowlist (`@ufg.br`, etc.) |
| `canonicalCategory(str)` | L129 | ✓ | Normaliza identificador de categoria |
| `buildPublicHandle(value, options)` | L141 | ✓ | Handle público normalizado |

### 2.5. Domínio **taxonomy base + opportunity** (`taxonomy`) — ~420L

Rótulos de módulos/categorias/sub-categorias + resolução fuzzy de área de oportunidade (histórica + aliases + scores).

| Função | Linha | Pública? | Observações |
|---|---|---|---|
| `getModuleLabel(moduleKey)` | L65 | ✓ | Rótulo humano do módulo |
| `getModuleIconClass(moduleKey)` | L70 | ✓ | Classe de ícone CSS do módulo |
| `getCategoryLabel(moduleKey, catKey)` | L75 | ✓ | Rótulo da categoria |
| `getSubcategoryLabel(moduleKey, subKey)` | L83 | ✓ | Rótulo da sub-categoria |
| `getOpportunityAreaDefinitions()` | L172 | ✓ | |
| `buildOpportunityTextParts(...)` | L179 | ✗ | |
| `getOpportunityAreaInfoByKey(key)` | L214 | ✓ | |
| `firstNonEmptyValue(values)` | L221 | ✗ | Helper local |
| `formatOpportunityAreaLabel(value)` | L230 | ✗ | |
| `scoreOpportunityAreaLabel(value)` | L237 | ✗ | |
| `pickPreferredOpportunityAreaLabel(...)` | L247 | ✗ | |
| `buildOfficialOpportunityAreaMaps()` | L257 | ✗ | |
| `getOpportunityAreaFuzzyThreshold(...)` | L269 | ✗ | |
| `getOpportunityAreaSimilarityScore(...)` | L276 | ✗ | |
| `isCloseOpportunityAreaAlias(...)` | L285 | ✗ | |
| `findBestOfficialOpportunityArea(...)` | L303 | ✗ | |
| `extractOpportunityAreaHistoryEntries(history)` | L320 | ✗ | |
| `buildHistoryOpportunityAreaMaps(...)` | L368 | ✗ | |
| `findBestOfficialContextArea(combinedText)` | L401 | ✗ | |
| `findBestFuzzyOpportunityArea(...)` | L421 | ✗ | |
| `resolveOpportunityArea(source, options)` | L447 | ✓ | **API pública principal** consumida por `kc-api.client.js` |
| `getOpportunityAreaEmoji(key)` | L537 | ✗ | |

> Observação estrutural: o subdomínio `opportunity` tem ~17 funções internas para 1 única função pública (`resolveOpportunityArea`). Esse é o padrão recorrente de todo o bloco taxonomy/location: muitos helpers privados, poucas funções públicas resolutoras.

### 2.6. Domínio **location** (`location`) — ~1 050L

O maior subdomínio. Engloba resolução fuzzy de **housing region**, **housing feature**, **housing type**, **caronas location**, **lost-found location** + inferências baseadas em título/tags.

#### 2.6.1. Housing (~720L) — L526–L1246

| Função | Linha | Pública? |
|---|---|---|
| `getHousingRegionDefinitions()` | L526 | ✓ |
| `getHousingFeatureDefinitions()` | L530 | ✓ |
| `getHousingFeatureEmoji(key)` | L553 | ✗ |
| `toStringArray(value)` | L588 | ✗ |
| `scoreHousingLabel(value)` | L611 | ✗ |
| `pickPreferredHousingLabel(current, candidate)` | L622 | ✗ |
| `formatHousingLabel(value)` | L632 | ✗ |
| `buildDefinitionAliasMap(definitions)` | L639 | ✗ |
| `getHousingFuzzyThreshold(source, target)` | L652 | ✗ |
| `getHousingSimilarityScore(source, target)` | L659 | ✗ |
| `isCloseHousingAlias(candidate, alias)` | L668 | ✗ |
| `findBestFuzzyHousingEntry(candidate, collection)` | L686 | ✗ |
| `buildHousingTextParts(source, fallbackTags)` | L710 | ✗ |
| `getHousingRegionInfoByKey(key)` | L763 | ✓ |
| `getHousingFeatureInfoByKey(key)` | L769 | ✓ |
| `extractHousingRegionHistoryEntries(history)` | L790 | ✗ |
| `buildHousingRegionHistoryMaps(history, map)` | L830 | ✗ |
| `resolveHousingRegion(source, options)` | L861 | ✓ **API pública principal** (consumida por `kc-api.client.js`) |
| `extractHousingFeatureHistoryEntries(history)` | L1089 | ✗ |
| `buildHousingFeatureHistoryMaps(history, map)` | L1131 | ✗ |
| `resolveSingleHousingFeature(value, options)` | L1159 | ✗ |
| `resolveHousingFeatures(source, options)` | L1204 | ✓ **API pública** (consumida por `kc-api.client.js`) |
| `resolveHousingTypeKey(source)` | L1246 | ✓ |
| `resolveHousingTypeFromCandidates(values)` | L1478 | ✗ |

#### 2.6.2. Caronas (~90L) — L1003–L1089

| Função | Linha | Pública? |
|---|---|---|
| `resolveCaronasLocation(rawInput)` | L1003 | ✓ |

#### 2.6.3. Lost-found (~230L) — L572 + L776–L783 + L1258–L1478

| Função | Linha | Pública? |
|---|---|---|
| `getLostFoundLocationEmoji(key)` | L572 | ✗ |
| `getLostFoundLocationDefinitions()` | L776 | ✓ |
| `getLostFoundLocationInfoByKey(key)` | L783 | ✓ |
| `buildLostFoundTextParts(source, fallbackTags)` | L1258 | ✗ |
| `extractLostFoundLocationHistoryEntries(history)` | L1290 | ✗ |
| `buildLostFoundHistoryMaps(history, map)` | L1320 | ✗ |
| `resolveLostFoundLocation(source, options)` | L1349 | ✓ **API pública** (consumida por `kc-api.client.js`) |

#### 2.6.4. Inferências por título/tags (~20L) — L1674–L1709

| Função | Linha | Pública? |
|---|---|---|
| `inferCaronasRoute(title)` | L1674 | ✗ |
| `inferAchadosLocation(source, tags)` | L1686 | ✗ |
| `inferOportunidadesSubcategory(source, tags)` | L1691 | ✗ |
| `inferEventosCategory(rawCat, tags)` | L1696 | ✗ |

> Observação: as 4 inferências são todas privadas e só consumidas por `applyPresentationRules` (seção 2.7). Em um split por domínio, podem acompanhar as respectivas location resolvers.

### 2.7. Domínio **presentation/rendering** (`presentation`) — ~600L — L1711–L2400

Aplicação das regras de apresentação e geração do HTML do card de post. **Domínio mais crítico e acoplado do arquivo** — consome praticamente todos os outros domínios.

| Função | Linha | Pública? | Observações |
|---|---|---|---|
| `applyPresentationRules(post, context)` | L1711 | ✓ | **313 linhas** — orquestração central que monta o objeto de apresentação a partir de `post` + todas as resolvers |
| `getDisplayMarkerTags(post, options)` | L2024 | ✓ | Retorna tags visíveis do post |
| `renderMarkerTags(tags, options)` | L2068 | ✗ | HTML dos marker tags |
| `renderPostCard(post, options)` | L2087 | ✓ | **279 linhas** — gera HTML completo do card (consumido pelos feeds e home) |

> ⚠️ **`renderPostCard` + `applyPresentationRules` somam ~592L**. Essa é a fração de maior risco em qualquer split: alteração acidental aqui afeta todos os 6 módulos públicos visualmente.

---

## 3. Consumers (callsites externos)

### 3.1. Arquivos JS que consomem `KCUtils.*`

| Arquivo | Nº de callsites (estimado) | Métodos mais usados |
|---|---|---|
| `assets/js/kc-api.client.js` | 10 | `normalizeText`, `resolveOpportunityArea`, `resolveHousingFeatures`, `resolveHousingRegion`, `resolveLostFoundLocation` |
| `assets/js/kc-api.related.js` | 2 | `normalizeText` |
| `assets/js/controllers/moradia.controller.js` | 12 | housing resolvers, `renderPostCard`, `getHousingRegion*`, `getHousingFeature*` |
| `assets/js/controllers/oportunidades.controller.js` | 8 | opportunity resolvers, `renderPostCard`, `applyPresentationRules` |
| `assets/js/controllers/achados-perdidos.controller.js` | 7 | lost-found resolvers, `renderPostCard` |
| `assets/js/controllers/profile.controller.js` | 6 | `renderPostCard`, `escapeHtml`, `timeAgo`, `buildProductDetailHref` |
| `assets/js/kc-core.js` | 6 | utilitários gerais |
| `assets/js/controllers/kc-feed.controller.js` | 3 | `renderPostCard`, `applyPresentationRules` |
| `assets/js/controllers/compra-venda-feed.controller.js` | 3 | `renderPostCard`, `splitPriceText` |
| `assets/js/kc-notifications.js` | 4 | `timeAgo`, `escapeHtml` |
| `assets/js/controllers/my-posts.controller.js` | 4 | `renderPostCard`, `buildProductDetailHref` |
| `assets/js/controllers/settings.controller.js` | 4 | `escapeHtml`, `buildProductDetailHref`, `copyTextToClipboard` |
| `assets/js/controllers/account-setup.controller.js` | 4 | `buildPublicHandle`, `normalizeEmail` |
| `assets/js/kc-comments.js` | 3 | `escapeHtml` |
| `assets/js/kc-auth.ui.js` | 3 | `isInstitutionalEmailAllowed`, `normalizeEmail` |
| `assets/js/controllers/admin-help-requests.controller.js` | 2 | `escapeHtml`, `timeAgo` |
| `assets/js/controllers/admin-invite.controller.js` | 2 | `isInstitutionalEmailAllowed` |
| `assets/js/controllers/admin-reports.controller.js` | 2 | `escapeHtml`, `timeAgo` |
| `assets/js/controllers/admin-moderation.controller.js` | 1 | `timeAgo` |
| `assets/js/controllers/admin-dashboard.controller.js` | 1 | `timeAgo` |
| `assets/js/controllers/caronas-feed.controller.js` | 1 | `resolveCaronasLocation` |
| `assets/js/controllers/help.controller.js` | 2 | `escapeHtml` |
| `assets/js/kc-create-post.resolvers.js` | **30** | resolvers de todos os domínios (pico de acoplamento) |
| `assets/js/kc-create-post.media.js` | 2 | `escapeHtml` |
| `assets/js/kc-create-post.render.js` | 4 | `escapeHtml`, `buildProductDetailHref` |
| `assets/js/kc-feed-filters.js` | 2 | `normalizeText`, `debounce` |
| `assets/js/kc-filters.js` | 2 | `normalizeText`, `debounce` |
| `assets/js/kc-public-shell.js` | 2 | — |
| `assets/js/controllers/product.popovers.js` | 2 | `escapeHtml` |
| `assets/js/controllers/product.report.js` | 2 | `escapeHtml` |

**Total:** 30 arquivos, 136+ callsites.

### 3.2. HTMLs que carregam `kc-utils.js`

**17 páginas:** todas as públicas (`index.html`, `caronas.html`, `moradia.html`, `oportunidades.html`, `eventos.html`, `compra-venda.html`, `achados-perdidos.html`, `_product.html`, `profile.html`, `my-posts.html`, `notifications.html`, `create-post.html`, `account-setup.html`, `settings.html`, `saved.html`, `help.html`, `auth.html`).

⚠️ **Admin páginas não carregam `kc-utils.js` diretamente** — mas 5 controllers admin (`admin-dashboard`, `admin-moderation`, `admin-reports`, `admin-help-requests`, `admin-invite`) o referenciam. Investigar se isso funciona via cadeia de imports ou se é regressão latente (provável carregamento via `admin-shell.html`).

### 3.3. Cobertura de testes atual

| Arquivo de teste | Linhas | Foco |
|---|---|---|
| `tests/kc-utils.test.js` | 66 | testes básicos iniciais (`titleCase`, `escapeHtml`, `normalizeText`) |
| `tests/kc-utils-expanded.test.js` | 431 | expansão com `timeAgo`, `formatCurrencyBRL`, `parseBRLNumber`, `clamp`, `debounce`, identidade, taxonomia base |
| `tests/kc-utils-resolvers.test.js` | 609 | resolvers de opportunity/housing/caronas/lost-found |

**Total: 1 106L** de testes já estabilizados. Qualquer regressão nos splits é imediatamente visível.

---

## 4. Plano de decomposição — `v12.2.0` a `v12.2.6`

O plano do `RELATORIO-KINOCAMPUS-V12.md` §5.1 previa 5 splits (`v12.2.0`–`v12.2.4`). Com o footprint real medido, **recomenda-se expandir para 7 iterações** (`v12.2.0`–`v12.2.6`) mais o gate (`v12.2.7`). O motivo é o acoplamento interno do domínio `presentation` e o volume do domínio `location`, que pedem iterações dedicadas para reduzir risco.

### 4.1. Sequência recomendada

| Iteração | Sub-módulo | Namespace | Funções (top-level) | Linhas estimadas | Testes novos | Risco |
|---|---|---|---|---|---|---|
| **v12.2.0** | `string` | `window._KCU.string` | 8 (incl. `levenshteinDistance` como helper) | ~180L movidas | ~12 | 🟢 baixo |
| **v12.2.1** | `format` | `window._KCU.format` | 7 (date + money + url) | ~120L movidas | ~12 | 🟢 baixo |
| **v12.2.2** | `dom` | `window._KCU.dom` | 4 (debounce + clipboard) | ~100L movidas | ~10 | 🟡 médio |
| **v12.2.3** | `identity` | `window._KCU.identity` | 6 | ~60L movidas | ~10 | 🟢 baixo |
| **v12.2.4** | `taxonomy` | `window._KCU.taxonomy` | ~22 (module labels + opportunity) | ~420L movidas | ~20 | 🟡 médio |
| **v12.2.5** | `location` | `window._KCU.location` | ~30 (housing + caronas + lostfound + inferências) | ~1 050L movidas | ~30 | 🟠 alto |
| **v12.2.6** | `presentation` | `window._KCU.presentation` | 4 (`applyPresentationRules`, `getDisplayMarkerTags`, `renderMarkerTags`, `renderPostCard`) | ~600L movidas | ~20 | 🔴 crítico |
| **v12.2.7** | — | — | gate final (kc-utils.js <900L) | — | — | 🟢 baixo |

**Projeção de redução acumulada:** 2 445L → ~75L (apenas facade + orquestração). Realisticamente estabiliza em **~80–150L** para preservar fallbacks defensivos e compatibilidade retroativa — meta de gate: **<900L** (folga de 6x).

### 4.2. Contrato mínimo por split (padrão já validado em `_KCAPI`/`_KCSA`)

Cada iteração `v12.2.x` segue **literalmente** o mesmo padrão consolidado na v11:

1. Criar novo IIFE `assets/js/kc-utils.<dominio>.js`:
   ```javascript
   (function () {
     'use strict';
     window._KCU = window._KCU || {};
     // ... funções do domínio ...
     window._KCU.<dominio> = Object.freeze({ /* exports */ });
   })();
   ```
2. Declarar tag `<script defer src="assets/js/kc-utils.<dominio>.js">` nas **17 páginas** públicas, **antes** de `kc-utils.js`.
3. No facade `kc-utils.js`, substituir a implementação pelas delegações thin-wrapper com fallback defensivo:
   ```javascript
   function titleCase(str) {
     if (window._KCU && window._KCU.string && typeof window._KCU.string.titleCase === 'function') {
       return window._KCU.string.titleCase(str);
     }
     // fallback inline preservado (cópia literal do original)
     // ...
   }
   ```
4. Manter `window.KCUtils = Object.freeze({...})` **intacto** — zero mudança de contrato público.
5. Criar `tests/kc-utils-<dominio>-module.test.js` com testes estáticos do IIFE + delegação + fallback.
6. Atualizar `tests/kc-utils-expanded.test.js` e `tests/kc-utils-resolvers.test.js` se necessário para refletir a cadeia (sem perder cobertura existente).

### 4.3. Dependências entre sub-módulos (grafo de carga)

```
window._KCU.string      ← nenhum
window._KCU.format      ← nenhum (timeAgo é auto-contido)
window._KCU.dom         ← nenhum
window._KCU.identity    ← _KCU.string (para normalizeText indiretamente via canonicalCategory)
window._KCU.taxonomy    ← _KCU.string (normalizeText, levenshteinDistance)
window._KCU.location    ← _KCU.string (normalizeText, levenshteinDistance), _KCU.taxonomy (OPPORTUNITY_AREA_DEFINITIONS via KC_CONSTANTS)
window._KCU.presentation ← TODAS as acima
```

**Ordem obrigatória no HTML:**
```
kc-constants.js → kc-utils.string.js → kc-utils.format.js → kc-utils.dom.js
                → kc-utils.identity.js → kc-utils.taxonomy.js → kc-utils.location.js
                → kc-utils.presentation.js → kc-utils.js (facade)
```

**Validação:** teste estático no bootstrap dos testes deve carregar todos os 8 arquivos (7 sub-módulos + facade) na ordem correta, mimetizando o HTML.

---

## 5. Matriz de risco × mitigação

| Domínio | Risco principal | Mitigação |
|---|---|---|
| **string** | Alteração acidental em `escapeHtml` gera XSS latente; `normalizeText` é consumido em ~15 callsites | Testes existentes em `kc-utils.test.js` + `kc-utils-expanded.test.js` cobrem. Novos testes focados na delegação. |
| **format** | `timeAgo` tem regras pt-BR sensíveis (min/hora/dia/mês); regressão silenciosa em string de data | `kc-utils-expanded.test.js` já testa boundary cases. Adicionar snapshots antes/depois. |
| **dom** | `copyTextToClipboard` usa Clipboard API + fallback `document.execCommand`; regressão de UX no product.controller | Cobertura existente em `kc-utils-expanded.test.js`. E2E Playwright na `v12.9.x` cobrirá copy/share do produto. |
| **identity** | `isInstitutionalEmailAllowed` é porta de entrada da plataforma inteira (auth gate); qualquer fraqueza = bug crítico | `kc-utils-expanded.test.js` cobre lista de domínios UFG. Adicionar fuzz test de e-mails inválidos. |
| **taxonomy** | `resolveOpportunityArea` é consumido pela fachada `KCAPI`; regressão afeta normalização persistida de posts | `kc-utils-resolvers.test.js` (609L) já cobre resolvers. Adicionar testes de delegação. |
| **location** | Maior volume (1 050L); housing e lost-found têm fuzzy matching sensível; regressão silenciosa em inferências | `kc-utils-resolvers.test.js` cobre. Split em sub-sub-módulos se volume ficar ingerenciável no review. |
| **presentation** | `renderPostCard` gera HTML final dos 6 módulos — qualquer drift visual é regressão estética; `applyPresentationRules` tem 313L de orquestração com branches complexas | **Snapshot DOM tests** no Jest antes de iniciar `v12.2.6`; rodar Playwright smoke (`v12.9.0`) **antes** de `v12.2.6` se o roadmap permitir; manter facade `kc-utils.js` reexportando estes métodos com fallback inline completo (não apenas delegação) para primeiros ciclos. |

**Princípio transversal:** nenhuma iteração `v12.2.x` pode alterar a assinatura de método público (`window.KCUtils.*`) nem reordenar parâmetros. Toda mudança visível seria regressão de contrato e violaria Definition of Done §7.4.

---

## 6. Definition of Done — `v12.1.0` (esta auditoria)

Como iteração **doc-only**, a v12.1.0 encerra quando:

- [x] `docs/kc-utils-audit-v12.1.md` (este arquivo) criado com footprint real, mapa por domínio, consumers, plano de decomposição e matriz de risco
- [x] `RELATORIO-KINOCAMPUS-V12.md` atualizado: `Estado desta fase` reflete `v12.1.0`; §5.1 expandida para 7 splits (`v12.2.0`–`v12.2.6`) + gate; §8.1 nova subseção detalhando esta iteração
- [x] `README.md` atualizado: nova linha em `Entregas Recentes`, `Progresso atual` aponta `v12.1.0` concluída e `v12.2.0` como próxima
- [x] `CHANGELOG.md` recebe entrada sob `## [Unreleased]` em `Docs`
- [x] `npm test` verde em **99/99 suites · 1874/1874 testes** (baseline imutável, nenhum teste novo, nenhum JS tocado)
- [x] `node scripts/hygiene-check.js` verde (8.6.0)

**Reversibilidade:** 100% (puramente documental).

---

## 7. Próxima iteração — `v12.2.0`

**Escopo:** split `window._KCU.string` — extração de 8 funções textuais para `assets/js/kc-utils.string.js`.

**Critério de sucesso:**
- `kc-utils.string.js` criado, registra `window._KCU.string` e exporta: `titleCase`, `beautifyKey`, `normalizeText`, `slugifyText`, `escapeHtml`, `cssEscape`, `renderMarkdownInline`, `levenshteinDistance`
- 17 HTMLs carregam o novo asset antes de `kc-utils.js`
- `kc-utils.js` delega os 8 métodos com fallback defensivo
- Nova suíte `tests/kc-utils-string-module.test.js` (~12 testes)
- Baseline sobe para **100 suites · ~1886 testes**
- `kc-utils.js` reduz de 2 445L para ~2 265L

**Inputs dessa auditoria para o `v12.2.0`:** seções 2.1 (mapa do domínio `string`), 3 (callsites para validar delegação) e 5 (mitigação de risco do domínio).
