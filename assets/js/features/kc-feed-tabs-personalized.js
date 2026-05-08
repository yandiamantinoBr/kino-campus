/*
 * KinoCampus -- v75.1
 * kc-feed-tabs-personalized.js
 *
 * Hidrata os links do kc-feed-tabs (após o kc-feed-tabs__divider) com
 * abas personalizadas vindas do RPC kc_get_personalized_tabs.
 *
 * Estratégia:
 *  1. Os 8 links estáticos no HTML servem de FALLBACK imediato (zero flash).
 *  2. Após o boot, chamamos KCAPI.getPersonalizedTabs(8). Se retornar dados,
 *     resolvemos label/href/icon via catálogo local (TAB_CATALOG) e
 *     substituímos os <a> após o divider.
 *  3. Aplicamos regra de DIVERSIDADE: garantir ≥4 módulos distintos no top-N
 *     (rebalanceando se um módulo dominar).
 *  4. Cache em sessionStorage (TTL 10 min) para evitar refetch.
 *  5. Clique em uma aba registra afinidade via kc_track_home_category_affinity
 *     (já existente), fechando o loop de personalização.
 */
(function () {
  'use strict';

  const CACHE_KEY = 'kc:personalizedTabs:v1';
  const CACHE_TTL_MS = 1000 * 60 * 10; // 10 min
  const TARGET_COUNT = 8;
  const MIN_DISTINCT_MODULES = 4;

  // Catálogo: (module_key[:category_key]) → {label, href, icon}
  // Mantido em sincronia com assets/js/boot/kc-constants.js (ícones por módulo)
  // e com a navegação principal. Hrefs apontam para páginas reais.
  const TAB_CATALOG = {
    // Módulos puros
    'achados-perdidos': { label: 'Achados/Perdidos', href: 'achados-perdidos.html', icon: 'fas fa-search' },
    'eventos': { label: 'Eventos', href: 'eventos.html', icon: 'fas fa-calendar' },
    'moradia': { label: 'Moradia', href: 'moradia.html', icon: 'fas fa-home' },
    'oportunidades': { label: 'Oportunidades', href: 'oportunidades.html', icon: 'fas fa-briefcase' },
    'compra-venda': { label: 'Compra e Venda', href: 'compra-venda-feed.html', icon: 'fas fa-shopping-bag' },
    'caronas': { label: 'Caronas', href: 'caronas-feed.html', icon: 'fas fa-car' },

    // Subcategorias frequentes
    'compra-venda:livros': { label: 'Livros', href: 'compra-venda-feed.html?filter=livros', icon: 'fas fa-book' },
    'compra-venda:eletronicos': { label: 'Eletrônicos', href: 'compra-venda-feed.html?filter=eletronicos', icon: 'fas fa-laptop' },
    'compra-venda:vestuario': { label: 'Roupas', href: 'compra-venda-feed.html?filter=vestuario', icon: 'fas fa-shirt' },
    'compra-venda:moveis': { label: 'Móveis', href: 'compra-venda-feed.html?filter=moveis', icon: 'fas fa-couch' },
    'eventos:sustentabilidade': { label: 'Sustentabilidade', href: 'eventos.html?filter=sustentabilidade', icon: 'fas fa-leaf' },
    'eventos:culturais': { label: 'Culturais', href: 'eventos.html?filter=culturais', icon: 'fas fa-masks-theater' },
    'eventos:academicos': { label: 'Acadêmicos', href: 'eventos.html?filter=academicos', icon: 'fas fa-graduation-cap' },
    'oportunidades:estagio': { label: 'Estágios', href: 'oportunidades.html?filter=estagio', icon: 'fas fa-user-graduate' },
    'oportunidades:bolsa': { label: 'Bolsas', href: 'oportunidades.html?filter=bolsa', icon: 'fas fa-award' },
    'moradia:republica': { label: 'Repúblicas', href: 'moradia.html?filter=republica', icon: 'fas fa-people-roof' },
  };

  function resolveTab(moduleKey, categoryKey) {
    const m = String(moduleKey || '').toLowerCase().trim();
    const c = String(categoryKey || '').toLowerCase().trim();
    if (!m) return null;
    const composite = c ? `${m}:${c}` : m;
    if (TAB_CATALOG[composite]) {
      return Object.assign({ key: composite, module: m, category: c || null }, TAB_CATALOG[composite]);
    }
    if (TAB_CATALOG[m]) {
      // categoria desconhecida → cai para o módulo, mas mantém categoria no key
      // para tracking de cliques futuros
      return Object.assign({ key: composite, module: m, category: c || null }, TAB_CATALOG[m]);
    }
    return null;
  }

  /* Diversidade: rebalanceia para ter pelo menos N módulos distintos no topo.
   * Se um único módulo domina os primeiros K resultados, intercala outros
   * módulos do final da lista. */
  function applyDiversity(tabs, minDistinct) {
    if (!Array.isArray(tabs) || tabs.length <= 1) return tabs || [];
    const seen = new Set();
    const head = [];
    const tail = [];
    for (const t of tabs) {
      if (seen.size < minDistinct && !seen.has(t.module)) {
        head.push(t);
        seen.add(t.module);
      } else if (seen.has(t.module) && head.length < minDistinct) {
        tail.push(t);
      } else {
        tail.push(t);
      }
    }
    return head.concat(tail);
  }

  /* Lê cache do sessionStorage (TTL). */
  function readCache() {
    try {
      const raw = window.sessionStorage && window.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.tabs)) return null;
      if (Date.now() - (obj.t || 0) > CACHE_TTL_MS) return null;
      return obj.tabs;
    } catch (_) { return null; }
  }

  function writeCache(tabs) {
    try {
      if (!window.sessionStorage) return;
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), tabs }));
    } catch (_) { /* quota; ignore */ }
  }

  /* Renderiza os <a> após o divider, removendo os existentes. */
  function renderTabs(container, tabs) {
    if (!container || !Array.isArray(tabs) || tabs.length === 0) return;
    const divider = container.querySelector('.kc-feed-tabs__divider');
    if (!divider) return;

    // Remove todos os <a> após o divider (preserva botões data-feed-tab e o divider)
    let node = divider.nextSibling;
    while (node) {
      const next = node.nextSibling;
      if (node.nodeType === 1 && node.tagName === 'A') {
        container.removeChild(node);
      }
      node = next;
    }

    // Insere os novos <a> personalizados
    tabs.forEach((tab) => {
      const a = document.createElement('a');
      a.href = tab.href;
      a.setAttribute('data-kc-tab-key', tab.key);
      a.setAttribute('data-kc-tab-module', tab.module || '');
      if (tab.category) a.setAttribute('data-kc-tab-category', tab.category);
      a.setAttribute('aria-label', tab.label);
      a.innerHTML = `<i class="${tab.icon}"></i><span>${tab.label}</span>`;
      container.appendChild(a);
    });
  }

  /* Registra clique para alimentar o algoritmo na próxima visita. */
  function attachClickTracking(container) {
    if (!container || container.__kcTrackingAttached) return;
    container.__kcTrackingAttached = true;
    container.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest('a[data-kc-tab-module]');
      if (!a) return;
      const moduleKey = a.getAttribute('data-kc-tab-module') || '';
      const categoryKey = a.getAttribute('data-kc-tab-category') || '';
      if (!moduleKey) return;
      try {
        const sb = window.KCSupabase && typeof window.KCSupabase.getClient === 'function'
          ? window.KCSupabase.getClient() : null;
        if (!sb) return;
        // Fire-and-forget; não bloqueia navegação
        sb.rpc('kc_track_home_category_affinity', {
          p_module_key: moduleKey,
          p_category_key: categoryKey || null,
          p_session_id: (window.KCSession && window.KCSession.getAnonId && window.KCSession.getAnonId()) || null,
          p_weight: 1.0,
        }).then(() => {}).catch(() => {});
      } catch (_) { /* ignore */ }
    }, true);
  }

  async function hydrate() {
    const container = document.getElementById('kc-home-feed-tabs');
    if (!container) return;
    if (!container.querySelector('.kc-feed-tabs__divider')) return;

    attachClickTracking(container);

    // 1. Tenta cache imediatamente para reduzir flicker
    const cached = readCache();
    if (cached && cached.length) {
      renderTabs(container, cached);
    }

    // 2. Busca dados frescos do RPC
    if (!window.KCAPI || typeof window.KCAPI.getPersonalizedTabs !== 'function') return;
    let raw = [];
    try {
      raw = await window.KCAPI.getPersonalizedTabs(TARGET_COUNT * 2); // pega extra para diversificar
    } catch (e) {
      return;
    }
    if (!Array.isArray(raw) || raw.length === 0) return;

    // 3. Resolve label/href/icon via catálogo
    const resolved = raw
      .map((row) => resolveTab(row.out_module_key || row.module_key, row.out_category_key || row.category_key))
      .filter(Boolean);

    if (resolved.length === 0) return;

    // 4. Aplica diversidade e corta para TARGET_COUNT
    const diversified = applyDiversity(resolved, MIN_DISTINCT_MODULES).slice(0, TARGET_COUNT);

    if (diversified.length === 0) return;

    writeCache(diversified);
    renderTabs(container, diversified);

    // 5. Re-aplica indicadores de scroll (o conteúdo mudou)
    if (typeof window.kcInitScrollIndicators === 'function') {
      try { window.kcInitScrollIndicators(); } catch (_) {}
    }
  }

  function start() {
    // Espera o boot da KCAPI e o DOM do feed-tabs estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(hydrate, 50));
    } else {
      setTimeout(hydrate, 50);
    }
  }

  start();
})();
