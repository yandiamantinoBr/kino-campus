/**
 * kc-core-widgets.js — v13.6.1
 * Extraído de kc-core.js (v13.6.1 split).
 * Contém: WhatsApp share, sort tabs, compactação textual e wordmark responsivo.
 */
(function () {
  'use strict';

  function kcInitHeaderWordmarkFit() {
    document.querySelectorAll('.kc-header:not(.kc-header--admin) .kc-logo').forEach((logo) => {
      if (logo.dataset.kcWordmarkFitBound === '1') return;
      const link = logo.querySelector('a');
      const mark = logo.querySelector('.kc-logo-mark');
      const text = logo.querySelector('.kc-logo-text');
      const name = logo.querySelector('.kc-logo-name');
      const container = logo.parentElement;
      const header = logo.closest('.kc-header');
      if (!link || !mark || !text || !name) return;
      logo.dataset.kcWordmarkFitBound = '1';

      let frame = 0;
      const sync = () => {
        const mobile = window.innerWidth <= 768;
        const loginCandidate = container.querySelector('.btn-login:not(.is-auth)');
        const login = loginCandidate && window.getComputedStyle(loginCandidate).display !== 'none' ? loginCandidate : null;
        // Auth hydration replaces the contents, never the trigger itself.
        // Keep the full label measurable while allowing a short visual one.
        if (login && !login.querySelector('.kc-login-label-full') && login.textContent.trim() === 'Login/Cadastro') {
          const full = document.createElement('span');
          full.className = 'kc-login-label-full';
          full.textContent = login.textContent;
          const compact = document.createElement('span');
          compact.className = 'kc-login-label-compact';
          compact.textContent = 'Entrar';
          compact.setAttribute('aria-hidden', 'true');
          login.replaceChildren(full, compact);
        }
        const gap = parseFloat(window.getComputedStyle(link).columnGap) || 0;
        // Intrinsic brand/label measurements never depend on the stretched
        // logo track or on the control widths applied by a previous frame.
        const required = Math.ceil(mark.offsetWidth + name.offsetWidth + gap + 1);
        const style = window.getComputedStyle(container);
        const outerWidth = (element) => {
          const itemStyle = window.getComputedStyle(element);
          const full = element === login && element.querySelector('.kc-login-label-full');
          const width = full ? Math.max(parseFloat(itemStyle.minWidth) || 0, full.getBoundingClientRect().width
            + (parseFloat(itemStyle.paddingLeft) || 0) + (parseFloat(itemStyle.paddingRight) || 0)
            + (parseFloat(itemStyle.borderLeftWidth) || 0) + (parseFloat(itemStyle.borderRightWidth) || 0))
            : element.getBoundingClientRect().width;
          return width
            + (parseFloat(itemStyle.marginLeft) || 0) + (parseFloat(itemStyle.marginRight) || 0);
        };
        const visible = mobile && name.offsetWidth > 0;
        const properties = ['--kc-header-control-width', '--kc-header-icon-size', '--kc-header-column-gap', '--kc-header-action-gap'];
        const controls = [];
        let fixedWidth = 0;
        let slotCount = 0;
        let actionGapCount = 0;
        const search = container.querySelector('.kc-search-mobile-btn');
        if (search && window.getComputedStyle(search).display !== 'none') {
          controls.push(search);
          slotCount += 1;
        }
        const actions = container.querySelector('.kc-user-actions');
        if (actions) {
          const items = Array.from(actions.children).filter((item) => window.getComputedStyle(item).display !== 'none');
          if (items.length) slotCount += 1;
          actionGapCount = Math.max(0, items.length - 1);
          items.forEach((item) => {
            if (item.matches('button:not(.btn-login), a.icon-btn')) controls.push(item);
            else fixedWidth += outerWidth(item);
          });
        }
        const nav = container.querySelector('.kc-nav-links');
        if (nav && window.getComputedStyle(nav).display !== 'none') {
          fixedWidth += Array.from(nav.querySelectorAll('a')).reduce((largest, item) => Math.max(largest, outerWidth(item)), 44);
          slotCount += 1;
        }
        controls.forEach((control) => {
          const controlStyle = window.getComputedStyle(control);
          fixedWidth += (parseFloat(controlStyle.marginLeft) || 0) + (parseFloat(controlStyle.marginRight) || 0);
        });
        let budget = container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - required - fixedWidth;
        // Keep a 1px minimum between the logo/search/actions/nav slots. At
        // 320px with enlarged text, inner action gaps may need to reach zero.
        const minimumGaps = slotCount;
        // Preserve the full label across system-font metrics: the 43–44px
        // comfort band costs at most 1px per target (height stays 44px), while
        // avoiding a much shorter label and a large unused gap. This uses the
        // measured budget, never the operating system or a viewport exception.
        const comfortableWidth = 43;
        let compactLogin = false;
        if (visible && login && budget < controls.length * comfortableWidth + minimumGaps) {
          const full = login.querySelector('.kc-login-label-full');
          const compact = login.querySelector('.kc-login-label-compact');
          if (full && compact) {
            const loginStyle = window.getComputedStyle(login);
            const boxWidth = (parseFloat(loginStyle.paddingLeft) || 0) + (parseFloat(loginStyle.paddingRight) || 0)
              + (parseFloat(loginStyle.borderLeftWidth) || 0) + (parseFloat(loginStyle.borderRightWidth) || 0);
            const minimumWidth = parseFloat(loginStyle.minWidth) || 0;
            const fullWidth = Math.max(minimumWidth, full.getBoundingClientRect().width + boxWidth);
            const shortWidth = Math.max(minimumWidth, compact.getBoundingClientRect().width + boxWidth);
            // A cached-auth placeholder can have zero-size text. It is not a
            // label to shorten; keep its actual minimum footprint until auth.
            compactLogin = compact.getBoundingClientRect().width > 0 && shortWidth < fullWidth;
            if (compactLogin) budget += fullWidth - shortWidth;
          }
        }
        if (visible) {
          const count = controls.length;
          const gapCount = slotCount + actionGapCount;
          let width = count ? Math.min(44, (budget - minimumGaps) / count) : 44;
          let extraGap;
          if (width < comfortableWidth) {
            // Prefer some breathing room while targets are narrower, relaxing
            // it only when necessary to retain the established 26px fallback.
            extraGap = gapCount ? Math.max(0, Math.min(2, (budget - minimumGaps - count * 26) / gapCount)) : 0;
            width = count ? (budget - minimumGaps - extraGap * gapCount) / count : 44;
          } else {
            extraGap = gapCount ? Math.max(0, Math.min(5, (budget - minimumGaps - count * 44) / gapCount)) : 0;
          }
          // Round down to a CSS layout unit so rounding never consumes the
          // brand's safety pixel. Writes are idempotent under ResizeObserver.
          width = Math.floor(Math.max(26, Math.min(44, width)) * 64) / 64;
          extraGap = Math.floor(extraGap * 64) / 64;
          const values = [width, Math.max(16, Math.min(22, width / 2)), 1 + extraGap, extraGap];
          properties.forEach((property, index) => {
            const value = `${values[index]}px`;
            if (header.style.getPropertyValue(property) !== value) header.style.setProperty(property, value);
          });
        } else {
          properties.forEach((property) => {
            if (header.style.getPropertyValue(property)) header.style.removeProperty(property);
          });
        }
        if (container.classList.contains('kc-header-container--compact-login') !== compactLogin) {
          container.classList.toggle('kc-header-container--compact-login', compactLogin);
        }
        // Voice control and screen readers must receive the visible label.
        // aria-hidden does not affect the full span's intrinsic measurement.
        if (login) {
          const full = login.querySelector('.kc-login-label-full');
          const compact = login.querySelector('.kc-login-label-compact');
          if (full && compact) {
            full.setAttribute('aria-hidden', String(compactLogin));
            compact.setAttribute('aria-hidden', String(!compactLogin));
          }
        }
        if (logo.classList.contains('kc-logo--wordmark-visible') !== visible) {
          logo.classList.toggle('kc-logo--wordmark-visible', visible);
        }
        // Messages uses this variable for its available height. Font/auth
        // changes can reflow the header without a window resize event.
        const height = header.offsetHeight;
        if (height && document.documentElement.style.getPropertyValue('--kc-header-height') !== `${height}px`) {
          document.documentElement.style.setProperty('--kc-header-height', `${height}px`);
        }
      };
      const schedule = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          sync();
        });
      };

      // The free grid track changes after login, bell/chat injection and font
      // loading, even without a viewport resize. Observe sizes, not mutations.
      if (typeof window.ResizeObserver === 'function') {
        const observer = new window.ResizeObserver(schedule);
        [logo, mark, text, name, container, header, container.querySelector('.kc-nav-links'), container.querySelector('.kc-user-actions')]
          .filter(Boolean).forEach((element) => observer.observe(element));
      }
      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('orientationchange', schedule, { passive: true });
      document.addEventListener('kc:profilechange', schedule);
      document.addEventListener('kc:authchange', schedule);
      if (document.fonts) {
        document.fonts.ready.then(schedule);
        if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', schedule);
      }
      sync();
    });
  }

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
  window.KCCore.initHeaderWordmarkFit = kcInitHeaderWordmarkFit;
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

    function readSortFromUrl() {
      try {
        var params = new URLSearchParams(window.location.search || '');
        var sort = String(params.get('sort') || '').trim().toLowerCase();
        if (VALID_TABS.has(sort)) return sort;
      } catch (_) {}
      // Legacy hash bookmarks (#recentes) still work once; sort no longer owns the hash
      // so category filters (#academicos) stay intact.
      try {
        var hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
        if (VALID_TABS.has(hash)) return hash;
      } catch (_) {}
      return 'destaques';
    }

    function writeSortToUrl(key) {
      try {
        var url = new URL(window.location.href);
        if (!key || key === 'destaques') url.searchParams.delete('sort');
        else url.searchParams.set('sort', key);
        // Preserve category hash (#palestras) — never steal it for sort.
        history.replaceState(null, '', url.pathname + url.search + (url.hash || ''));
      } catch (_) {}
    }

    function setActiveTab(key) {
      getSortButtons().forEach(function (btn) {
        var active = btn.dataset.feedTab === key;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      writeSortToUrl(key);
    }

    function loadFeed(sortBy) {
      if (initialized) {
        var feedList = document.querySelector('.kc-feed-list');
        if (feedList) feedList.innerHTML = '';
      }
      opts.initFeedFn(sortBy);
      initialized = true;
    }

    var initKey = readSortFromUrl();
    currentSortBy = SORT_MAP[initKey] || 'votos';
    setActiveTab(initKey);

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

// Compacta somente a apresentação de cards no mobile, mantendo o texto
// completo no DOM para a volta ao desktop e para tecnologias assistivas.
(function () {
  'use strict';

  function kcTruncateText(el, maxChars) {
    if (!el) return;
    const existing = el.getAttribute('data-kc-fulltext');
    const full = (existing != null ? existing : (el.textContent || '')).trim();
    if (existing == null) el.setAttribute('data-kc-fulltext', full);
    if (!maxChars || maxChars <= 0 || full.length <= maxChars) {
      el.textContent = full;
      return;
    }
    el.textContent = full.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
  }

  function kcApplyMobileTextTruncation() {
    const isMobile = window.matchMedia('(max-width: 520px)').matches;
    document.querySelectorAll('.kc-card__title').forEach((el) => kcTruncateText(el, isMobile ? 80 : null));
    document.querySelectorAll('.kc-card__description-preview').forEach((el) => kcTruncateText(el, isMobile ? 160 : null));
  }

  function initMobileTextTruncation() {
    if (document.documentElement.dataset.kcMobileTextTruncationBound === '1') return;
    document.documentElement.dataset.kcMobileTextTruncationBound = '1';
    kcApplyMobileTextTruncation();
    window.addEventListener('resize', kcDebounce(kcApplyMobileTextTruncation, 150));
  }

  window.KCCore = window.KCCore || {};
  window.KCCore.initMobileTextTruncation = initMobileTextTruncation;
})();
