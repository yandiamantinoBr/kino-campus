# Auditoria de Paridade entre Controllers — v11.28

**Data:** 15 de abril de 2026  
**Escopo:** 6 module controllers + 6 admin controllers  
**Objetivo:** mapear gaps de implementação em relação aos padrões arquiteturais estabelecidos

---

## 1. Padrões arquiteturais obrigatórios (module controllers com seção modal)

| Padrão | Descrição | Fonte canônica |
|--------|-----------|----------------|
| **KCOverlayLock duplo** | `document.body.classList.add('kc-modal-open')` + `KCOverlayLock.lock(key)` ao abrir seção; idem com remove/unlock ao fechar | achados-perdidos, compra-venda, moradia, oportunidades |
| **KCSessionStore/SWR** | `getSessionStore()` retorna `KCSessionStore`; cache de feed com `store.get(namespace, key, {maxAge})` e `store.set()` | achados-perdidos, moradia, compra-venda, oportunidades |
| **KCFeedFilters** | `getAllowedDatePresets(module)` retorna array de presets; `normalizeDatePreset`, `matchesDatePreset`, etc. | todos os 6 module controllers |

---

## 2. Inventário dos 6 module controllers

| Controller | KCOverlayLock seção | SWR cache | KCFeedFilters | Observação |
|------------|---------------------|-----------|---------------|------------|
| `achados-perdidos.controller.js` | ✅ `achados-section-modal` | ✅ `'achados-perdidos:index'` | ✅ | Referência canônica |
| `compra-venda-feed.controller.js` | ✅ `market-section-modal` | ✅ | ✅ | Referência canônica |
| `moradia.controller.js` | ✅ `housing-section-modal` | ✅ `'moradia:index'` | ✅ | Referência canônica |
| `oportunidades.controller.js` | ✅ `opportunities-section-modal` | ✅ | ✅ | Referência canônica |
| **`caronas-feed.controller.js`** | ❌ só `kc-modal-open` (linha 629) | ❌ só cache in-memory de locations (TTL local) | ✅ | **2 gaps** |
| **`eventos.controller.js`** | ❌ só `kc-modal-open` para seção (linha 244); cal modal OK (v11.27.2) | ❌ sem SWR | ✅ | **2 gaps** |

### Gaps identificados

#### Gap M1 — caronas-feed: KCOverlayLock ausente na seção modal
- **Arquivo:** `assets/js/controllers/caronas-feed.controller.js`
- **Linhas:** 629 (open), 668 (close)
- **Atual:** `document.body.classList.add('kc-modal-open')` / `.remove('kc-modal-open')`
- **Esperado:** adicionar `KCOverlayLock.lock('caronas-section-modal')` / `.unlock('caronas-section-modal')`
- **Impacto iOS:** scroll pass-through ao abrir seção de caronas no iPhone
- **Severidade:** alta (mesmo tipo de bug que A3 nos eventos cal modal, corrigido em v11.27.2)

#### Gap M2 — caronas-feed: SWR/KCSessionStore ausente
- **Arquivo:** `assets/js/controllers/caronas-feed.controller.js`
- **Atual:** somente `LOCATIONS_TTL` in-memory para dados de localização; sem cache de feed
- **Esperado:** `SECTION_CACHE_KEY = 'caronas:index'`, `getSessionStore()`, `store.get/set` para snapshot do feed
- **Impacto:** ao navegar de volta para caronas, feed recarrega do zero (UX ruim, consome quota Supabase)
- **Severidade:** média

#### Gap M3 — eventos: KCOverlayLock ausente na seção modal (filter section)
- **Arquivo:** `assets/js/controllers/eventos.controller.js`
- **Linhas:** 244 (open), 309 (close)
- **Atual:** `document.body.classList.add('kc-modal-open')` / `.remove('kc-modal-open')`
- **Esperado:** adicionar `KCOverlayLock.lock('eventos-section-modal')` / `.unlock('eventos-section-modal')`
- **Impacto iOS:** scroll pass-through ao abrir painel de filtros de eventos no iPhone
- **Severidade:** alta

#### Gap M4 — eventos: SWR/KCSessionStore ausente
- **Arquivo:** `assets/js/controllers/eventos.controller.js`
- **Atual:** sem cache de sessão; cada visita recarrega todos os eventos do Supabase
- **Esperado:** `SECTION_CACHE_KEY = 'eventos:index'`, `getSessionStore()`, cache de snapshot de feed
- **Impacto:** UX ruim + quota Supabase desnecessária em sessões longas
- **Severidade:** média

---

## 3. Inventário dos 6 admin controllers

Os admin controllers têm um padrão diferente dos module controllers:
- Não usam KCFeedFilters (nenhum preset de data nos filtros de admin)
- Não usam KCSessionStore/SWR (admin panels não precisam de snapshot cache — dados sempre frescos)
- Modais admin usam padrão próprio via `admin-shell.css` (`.kc-modal` com `max-height: 100dvh`, v11.27.3)

| Controller | KCOverlayLock modais | KCFeedFilters | Padrão admin | Observação |
|------------|----------------------|---------------|--------------|------------|
| `admin-banners.controller.js` | ❌ | N/A | `kc-modal-open` | Aceitável — admin pattern |
| `admin-dashboard.controller.js` | ❌ | N/A | `kc-modal-open` | Aceitável — admin pattern |
| `admin-help-requests.controller.js` | ❌ | N/A | `kc-modal-open` | Aceitável — admin pattern |
| `admin-invite.controller.js` | ❌ | N/A | `kc-modal-open` | Aceitável — admin pattern |
| `admin-moderation.controller.js` | ❌ | N/A | `kc-modal-open` | Aceitável — admin pattern |
| `admin-reports.controller.js` | ❌ | N/A | `kc-modal-open` | Aceitável — admin pattern |

**Conclusão admin:** Nenhum gap crítico — admins acessam via desktop/Chrome majoritariamente; o risco iOS é baixo neste contexto. Não requer KCOverlayLock nem SWR.

---

## 4. Plano de correção incremental

| Iteração | Escopo | Tipo | Impacto |
|----------|--------|------|---------|
| `v11.28.1` | Gaps M1 + M3: KCOverlayLock nas seções de caronas e eventos | fix JS | iOS scroll fix |
| `v11.28.2` | Gaps M2 + M4: SWR/KCSessionStore em caronas e eventos | feat JS | UX + quota |

### Detalhamento v11.28.1

**caronas-feed.controller.js** (linha 629, abertura):
```js
// antes:
document.body.classList.add('kc-modal-open');
// depois:
document.body.classList.add('kc-modal-open');
if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
  window.KCOverlayLock.lock('caronas-section-modal');
}
```

**caronas-feed.controller.js** (linha 668, fechamento):
```js
// antes:
if (wasActive) document.body.classList.remove('kc-modal-open');
// depois:
if (wasActive) {
  document.body.classList.remove('kc-modal-open');
  if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
    window.KCOverlayLock.unlock('caronas-section-modal');
  }
}
```

**eventos.controller.js** (linha 244, abertura):
```js
// antes:
document.body.classList.add('kc-modal-open');
// depois:
document.body.classList.add('kc-modal-open');
if (window.KCOverlayLock && typeof window.KCOverlayLock.lock === 'function') {
  window.KCOverlayLock.lock('eventos-section-modal');
}
```

**eventos.controller.js** (linha 309, fechamento):
```js
// antes:
if (wasActive) document.body.classList.remove('kc-modal-open');
// depois:
if (wasActive) {
  document.body.classList.remove('kc-modal-open');
  if (window.KCOverlayLock && typeof window.KCOverlayLock.unlock === 'function') {
    window.KCOverlayLock.unlock('eventos-section-modal');
  }
}
```

### Detalhamento v11.28.2

Modelar SWR em caronas e eventos conforme padrão de `achados-perdidos.controller.js`:
- Adicionar `const SECTION_CACHE_KEY = 'caronas:index'` / `'eventos:index'`
- Adicionar `const SECTION_CACHE_MAX_AGE_MS = 1000 * 60 * 10` (10 min)
- Extrair `getSessionStore()` wrapper
- Em `loadFeed` (ou equivalente): tentar `store.get(...)` antes do Supabase query; em caso de miss, fazer query e `store.set(...)`

---

## 5. Resumo

| Gap | Severidade | Iteração |
|-----|-----------|----------|
| M1: caronas KCOverlayLock | Alta | v11.28.1 |
| M3: eventos section KCOverlayLock | Alta | v11.28.1 |
| M2: caronas SWR | Média | v11.28.2 |
| M4: eventos SWR | Média | v11.28.2 |

Após v11.28.2: todos os 6 module controllers estarão em paridade arquitetural completa.
