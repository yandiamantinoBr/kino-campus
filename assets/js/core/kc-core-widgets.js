/**
 * kc-core-widgets.js — v13.6.1
 * Extraído de kc-core.js (v13.6.1 split).
 * Contém: WhatsApp share helpers + KCCore.bindModuleSortTabs
 */
(function () {
  'use strict';

  // -----------------------------
  // WhatsApp Share (V8.1.2.4.8)
  // - Adiciona botão de compartilhamento em TODOS os kc-card
  // - Abre WhatsApp (app/web) com: "Título\nURL"
  // -----------------------------
  function kcNormalizeShareUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw, window.location.href).href;
    } catch (_) {
      return raw;
    }
  }
  
  function kcResolveCardShareData(card) {
    const data = { url: '', title: '' };
    if (!card) return data;
  
    const titleEl = card.querySelector('.kc-card__title');
    data.title = (titleEl && titleEl.textContent) ? titleEl.textContent.trim() : '';
  
    const linkEl = card.querySelector('.kc-action-button') || titleEl;
    const href = (linkEl && linkEl.getAttribute) ? (linkEl.getAttribute('href') || '') : '';
    data.url = kcNormalizeShareUrl(href);
  
    return data;
  }
  
  function kcCreateWhatsAppShareButton(card) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kc-share-whatsapp';
    btn.setAttribute('aria-label', 'Compartilhar no WhatsApp');
  
    const data = kcResolveCardShareData(card);
    if (data.url) btn.dataset.shareUrl = data.url;
    if (data.title) btn.dataset.shareTitle = data.title;
  
    btn.innerHTML = '<svg viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>';
    return btn;
  }
  
  
  
  // Garante que o footer tenha exatamente 2 blocos principais:
  // - .kc-card__interactions (esquerda)
  // - .kc-card__actions (direita) -> share + CTA
  // Isso evita o botão do WhatsApp ficar centralizado no desktop (space-between com 3 filhos)
  // e evita bugs no mobile (footer em grid 1fr/auto).
  function kcEnsureCardActionsWrapper(card) {
    if (!card) return null;
    const footer = card.querySelector('.kc-card__footer');
    if (!footer) return null;
  
    let actions = footer.querySelector('.kc-card__actions');
    const interactions = footer.querySelector('.kc-card__interactions');
  
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'kc-card__actions';
  
      if (interactions && interactions.parentNode === footer) {
        // Inserir após interações
        if (interactions.nextSibling) footer.insertBefore(actions, interactions.nextSibling);
        else footer.appendChild(actions);
      } else {
        footer.appendChild(actions);
      }
    }
  
    // Move CTA para dentro do wrapper (quando ainda estiver como filho direto do footer)
    const cta = footer.querySelector('.kc-action-button');
    if (cta && cta.parentNode !== actions) {
      actions.appendChild(cta);
    }
  
    // Se já existir share em lugar errado, mover para dentro do wrapper
    const existingShare = footer.querySelector('.kc-share-whatsapp');
    if (existingShare && existingShare.parentNode !== actions) {
      actions.insertBefore(existingShare, actions.firstChild);
    }
  
    return actions;
  }
  function kcInjectWhatsAppShareButtonsIntoCards(root) {
    const scope = root || document;
    scope.querySelectorAll('.kc-card').forEach((card) => {
      const footer = card.querySelector('.kc-card__footer');
      if (!footer) return;
  
      const actions = kcEnsureCardActionsWrapper(card);
      if (!actions) return;
  
      // Se já existe no wrapper (ou foi movido para lá), não duplicar
      if (actions.querySelector('.kc-share-whatsapp')) return;
  
      const btn = kcCreateWhatsAppShareButton(card);
      const action = actions.querySelector('.kc-action-button');
  
      if (action) actions.insertBefore(btn, action);
      else actions.appendChild(btn);
    });
  }
  
  function kcOpenWhatsAppShare(url, title) {
    const u = kcNormalizeShareUrl(url);
    const t = String(title || '').trim();
    if (!u) return false;
  
    const text = (t ? (t + '\n') : '') + u;
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
    return true;
  }
  
  function kcInitWhatsAppShare() {
    // 1) Inject nos cards estáticos (fallback)
    kcInjectWhatsAppShareButtonsIntoCards(document);
  
    // 2) Clique via delegation (funciona para cards dinâmicos)
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.kc-share-whatsapp');
      if (!btn) return;
  
      e.preventDefault();
      e.stopPropagation();
  
      const card = btn.closest('.kc-card');
      const fallback = kcResolveCardShareData(card);
  
      const url = btn.dataset.shareUrl || fallback.url;
      const title = btn.dataset.shareTitle || fallback.title;
      const postId = card && card.dataset ? String(card.dataset.postId || '').trim() : '';
  
      if (!url) return;
      if (kcOpenWhatsAppShare(url, title) && postId && window.KCAPI && typeof window.KCAPI.trackShare === 'function') {
        window.KCAPI.trackShare(postId, 'whatsapp').catch(function () { });
      }
    });
  
    // 3) Observer: novos cards injetados pelos controllers (feeds)
    const schedule = kcDebounce(() => kcInjectWhatsAppShareButtonsIntoCards(document), 120);
  
    try {
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const n of m.addedNodes) {
            if (!n || n.nodeType !== 1) continue;
            const el = /** @type {Element} */ (n);
            if (el.classList?.contains('kc-card') || el.querySelector?.('.kc-card')) {
              schedule();
              return;
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (_) { }
  }
  // Init

  window.KCCore = window.KCCore || {};
  window.KCCore.initWhatsAppShare = kcInitWhatsAppShare;
})();

// ─────────────────────────────────────────────────────────────────────────────
// KCCore.bindModuleSortTabs — tabs de ordenação (Destaques/Recentes/Comentados)
// para páginas de módulo (eventos, moradia, caronas, etc.).
//
// Uso:
//   window.KCCore.bindModuleSortTabs({ initFeedFn: function(sortBy) { ... } });
//
// O initFeedFn recebe 'votos' | 'recentes' | 'comentados' e deve chamar
// KCControllers.injectFeed com o sortBy correspondente.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var SORT_MAP = { destaques: 'votos', recentes: 'recentes', comentados: 'comentados' };
  var VALID_TABS = new Set(Object.keys(SORT_MAP));

  function bindModuleSortTabs(opts) {
    if (!opts || typeof opts.initFeedFn !== 'function') return;

    var currentSortBy = 'votos';
    var initialized = false;

    function getSortButtons() {
      return Array.from(document.querySelectorAll('[data-feed-tab]'))
        .filter(function (btn) { return VALID_TABS.has(btn.dataset.feedTab); });
    }

    function setActiveTab(key) {
      getSortButtons().forEach(function (btn) {
        var active = btn.dataset.feedTab === key;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      var hash = key === 'destaques' ? '' : '#' + key;
      try { history.replaceState(null, '', hash || window.location.pathname + window.location.search); } catch (_) {}
    }

    function loadFeed(sortBy) {
      if (initialized) {
        var feedList = document.querySelector('.kc-feed-list');
        if (feedList) feedList.innerHTML = '';
      }
      opts.initFeedFn(sortBy);
      initialized = true;
    }

    // Lê hash para tab inicial
    var initHash = (window.location.hash || '').replace('#', '').toLowerCase();
    if (initHash && VALID_TABS.has(initHash)) {
      currentSortBy = SORT_MAP[initHash];
      setActiveTab(initHash);
    } else {
      setActiveTab('destaques');
    }

    // Carrega feed inicial
    loadFeed(currentSortBy);

    // Bind nos botões de tab
    getSortButtons().forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.dataset.feedTab;
        var sortBy = SORT_MAP[key];
        if (!sortBy || sortBy === currentSortBy) return;
        currentSortBy = sortBy;
        setActiveTab(key);
        loadFeed(sortBy);
      });
    });
  }

  window.KCCore = window.KCCore || {};
  window.KCCore.bindModuleSortTabs = bindModuleSortTabs;
})();
