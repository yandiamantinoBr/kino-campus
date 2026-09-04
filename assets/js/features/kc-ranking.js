/* KinoCampus — kc-ranking.js
   Componente compartilhado de ranking "Top Contribuidores" para sidebars de módulos.
   Auto-detecta containers [data-kc-ranking-sidebar] e renderiza o ranking via KCAPI.
*/
(function () {
  'use strict';

  var MODULE_ICONS = {
    'compra-venda':     'fas fa-shopping-bag',
    'moradia':          'fas fa-home',
    'caronas':          'fas fa-car',
    'eventos':          'fas fa-calendar-alt',
    'oportunidades':    'fas fa-briefcase',
    'achados-perdidos': 'fas fa-search',
    'livros':           'fas fa-book'
  };

  var MODULE_LABELS = {
    'compra-venda':     'Compra e Venda',
    'moradia':          'Moradia',
    'caronas':          'Caronas',
    'eventos':          'Eventos',
    'oportunidades':    'Oportunidades',
    'achados-perdidos': 'Achados/Perdidos'
  };

  // Cache: module → { period → [ {user_id, rank, ...} ] }
  var RANK_CACHE_MAX_AGE_MS = 1000 * 60 * 5;
  var RANK_REVALIDATE_COOLDOWN_MS = 1000 * 20;

  // Cache: module -> { period -> { users, signature, timestamp, source } }
  var rankCache = {};
  var rankRequests = {};
  var infoModalReturnFocus = null;

  function getSessionStore() {
    return window.KCSessionStore && typeof window.KCSessionStore.get === 'function'
      ? window.KCSessionStore
      : null;
  }

  function getRankingCacheKey(module, period) {
    return String(module || '__general__') + ':' + String(period || 'month');
  }

  function normalizeUsers(users) {
    return Array.isArray(users) ? users.filter(function (user) { return user && typeof user === 'object'; }) : [];
  }

  function escapeHtml(value) {
    if (window.KCUtils && typeof window.KCUtils.escapeHtml === 'function') {
      return window.KCUtils.escapeHtml(String(value == null ? '' : value));
    }
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function getSafeAvatarUrl(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw || raw.length > 2048) return '';
    try {
      var base = (window.location && window.location.origin)
        ? window.location.origin
        : 'https://www.kinocampus.com.br';
      var parsed = new URL(raw, base);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      parsed.username = '';
      parsed.password = '';
      return parsed.href;
    } catch (_) {
      return '';
    }
  }

  function getRankingAvatarThumbnailUrl(value) {
    try {
      var raw = String(value == null ? '' : value).trim();
      var env = window.KC_ENV || {};
      var configuredUrl = env.SUPABASE_URL || (env.supabase && env.supabase.url);
      var origin = new URL(String(configuredUrl || ''));
      var avatar = new URL(raw);
      var prefix = '/storage/v1/object/public/kino-media/profile-avatars/';
      // Restrict transformations to our public raster avatars. Signed URLs,
      // query parameters, animated/vector formats and other origins are untouched.
      if (origin.protocol !== 'https:' || origin.username || origin.password ||
          origin.pathname !== '/' || origin.search || origin.hash ||
          avatar.protocol !== 'https:' || avatar.origin !== origin.origin ||
          avatar.username || avatar.password || /[?#\\]/.test(raw) ||
          avatar.pathname.indexOf(prefix) !== 0 ||
          /%(?:2f|5c|00)/i.test(avatar.pathname) ||
          !/\.(?:jpe?g|png|webp)$/i.test(avatar.pathname)) return '';
      // 2026-09-04: /api/media substitui /render/ (quota de transformacoes do
      // Supabase estourada). Recorte quadrado 144x144 preservado (fit=cover);
      // a maior avatar do ranking tem 44 CSS px, 144 cobre DPR 3.
      var objectPath = avatar.pathname.slice('/storage/v1/object/public/'.length);
      return '/api/media?path=' + encodeURIComponent(objectPath) + '&w=144&h=144&fit=cover&q=80';
    } catch (_) {
      return '';
    }
  }

  function getRankingAvatarMarkup(value, safeName) {
    var original = getSafeAvatarUrl(value);
    if (!original) return '';
    var thumbnail = getRankingAvatarThumbnailUrl(value);
    var fallbackAttribute = thumbnail
      ? ' data-kc-ranking-avatar-original="' + escapeHtml(original) + '"'
      : '';
    return '<img src="' + escapeHtml(thumbnail || original) + '" alt="' + safeName + '" loading="lazy"' + fallbackAttribute + '>';
  }

  function bindRankingAvatarFallbacks(container) {
    container.querySelectorAll('img[data-kc-ranking-avatar-original]').forEach(function (image) {
      var original = image.getAttribute('data-kc-ranking-avatar-original');
      var restored = false;
      function restoreOriginal() {
        if (restored) return;
        restored = true;
        image.removeEventListener('error', restoreOriginal);
        image.removeAttribute('data-kc-ranking-avatar-original');
        image.src = original;
      }
      image.addEventListener('error', restoreOriginal, { once: true });
      // A failed cached image may have completed before its listener was attached.
      if (image.complete && image.naturalWidth === 0) restoreOriginal();
    });
  }

  function getSafeProfileHref(userId) {
    return 'profile.html?id=' + encodeURIComponent(String(userId == null ? '' : userId).trim().slice(0, 160));
  }

  function getSafeScore(value) {
    var score = Number(value);
    return Number.isFinite(score) ? score : 0;
  }

  function buildRankingSignature(users) {
    return JSON.stringify(normalizeUsers(users).map(function (user) {
      return [
        String(user.user_id || ''),
        String(user.display_name || ''),
        String(user.avatar_url || ''),
        Number(user.score) || 0
      ];
    }));
  }

  function getRankBucket(module) {
    var cacheKey = module || '__general__';
    if (!rankCache[cacheKey]) rankCache[cacheKey] = {};
    return rankCache[cacheKey];
  }

  function getCachedRanking(period, module, options) {
    var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
    var bucket = getRankBucket(module);
    var entry = bucket[period];
    var maxAge = Number(opts.maxAge) || RANK_CACHE_MAX_AGE_MS;

    if (entry && Array.isArray(entry.users)) {
      return {
        users: entry.users,
        signature: entry.signature || buildRankingSignature(entry.users),
        timestamp: Number(entry.timestamp) || Date.now(),
        age: Math.max(0, Date.now() - (Number(entry.timestamp) || Date.now())),
        source: entry.source || 'memory'
      };
    }

    var store = getSessionStore();
    if (!store) return null;

    var cached = store.get('ranking', getRankingCacheKey(module, period), { maxAge: maxAge });
    var payload = cached && cached.value && typeof cached.value === 'object' ? cached.value : null;
    var users = payload && Array.isArray(payload.users) ? normalizeUsers(payload.users) : null;
    if (!users) return null;

    entry = {
      users: users,
      signature: String(payload.signature || buildRankingSignature(users)),
      timestamp: Number(cached.timestamp) || Date.now(),
      source: 'session'
    };
    bucket[period] = entry;

    return {
      users: entry.users,
      signature: entry.signature,
      timestamp: entry.timestamp,
      age: Number(cached.age) || Math.max(0, Date.now() - entry.timestamp),
      source: 'session'
    };
  }

  function persistRanking(period, module, users) {
    var normalized = normalizeUsers(users);
    var entry = {
      users: normalized,
      signature: buildRankingSignature(normalized),
      timestamp: Date.now(),
      source: 'network'
    };

    getRankBucket(module)[period] = entry;

    var store = getSessionStore();
    if (store && typeof store.set === 'function') {
      store.set('ranking', getRankingCacheKey(module, period), {
        users: normalized,
        signature: entry.signature
      });
    }

    return entry;
  }

  function shouldRevalidateRanking(entry) {
    if (!entry) return true;
    return Number(entry.age) >= RANK_REVALIDATE_COOLDOWN_MS;
  }

  function requestRanking(period, module, limit) {
    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      return Promise.reject(new Error('ranking-api-unavailable'));
    }

    var requestKey = getRankingCacheKey(module, period) + ':' + String(limit || 10);
    if (rankRequests[requestKey]) return rankRequests[requestKey];

    rankRequests[requestKey] = api.getTopContributors(period, module, limit || 10)
      .then(function (users) {
        return persistRanking(period, module, users);
      })
      .finally(function () {
        delete rankRequests[requestKey];
      });

    return rankRequests[requestKey];
  }

  function setRankingMarkup(container, signature, markup) {
    if (!container) return false;
    if (container.dataset.kcRankingSignature === signature) return false;
    container.innerHTML = markup;
    bindRankingAvatarFallbacks(container);
    container.dataset.kcRankingSignature = signature;
    return true;
  }

  function renderSidebarRanking(container, users, module) {
    var iconClass = getModuleIcon(module);
    var normalized = normalizeUsers(users);
    var signature = 'sidebar:' + String(module || '__general__') + ':' + buildRankingSignature(normalized);

    if (!normalized.length) {
      setRankingMarkup(container, signature, '<span class="kc-ranking-empty">Nenhum contribuidor no periodo.</span>');
      return false;
    }

    var markup = normalized.map(function (u, i) {
      var name = String(u.display_name || 'Usuario');
      var safeName = escapeHtml(name);
      var avatarHtml = getRankingAvatarMarkup(u.avatar_url, safeName) || '<i class="fas fa-user" aria-hidden="true"></i>';
      return '<a href="' + escapeHtml(getSafeProfileHref(u.user_id)) + '" class="kc-ranking-sidebar-item">' +
        '<span class="kc-ranking-sidebar-item__pos"><i class="' + iconClass + '" style="font-size:0.85em;margin-right:2px;" aria-hidden="true"></i>' + (i + 1) + '</span>' +
        '<span class="kc-ranking-sidebar-item__avatar">' + avatarHtml + '</span>' +
        '<span class="kc-ranking-sidebar-item__name">' + safeName + '</span>' +
        '<span class="kc-ranking-sidebar-item__score">' + getSafeScore(u.score) + ' pts</span>' +
      '</a>';
    }).join('');

    var didRender = setRankingMarkup(container, signature, markup);
    decorateAuthorAvatars(normalized, module);
    return didRender;
  }

  function renderHomeRanking(container, users, module) {
    var iconClass = getModuleIcon(module);
    var normalized = normalizeUsers(users);
    var signature = 'home:' + String(module || '__general__') + ':' + buildRankingSignature(normalized);

    if (!normalized.length) {
      setRankingMarkup(container, signature, '<span class="kc-ranking-empty">Nenhum contribuidor no periodo.</span>');
      return false;
    }

    var markup = normalized.map(function (u, i) {
      var name = String(u.display_name || 'Usuario');
      var safeName = escapeHtml(name);
      var score = getSafeScore(u.score);
      var avatarHtml = getRankingAvatarMarkup(u.avatar_url, safeName) || '<i class="fas fa-user" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0.9em;color:var(--kc-text-dark-secondary);" aria-hidden="true"></i>';
      return '<a href="' + escapeHtml(getSafeProfileHref(u.user_id)) + '" class="kc-ranking-user" title="' + safeName + ' - ' + score + ' pts">' +
        '<div class="kc-ranking-user-avatar">' + avatarHtml +
          '<span class="kc-ranking-user-position"><i class="' + iconClass + '" aria-hidden="true"></i>' + (i + 1) + '</span>' +
        '</div>' +
        '<span class="kc-ranking-user-name">' + safeName + '</span>' +
        '<span class="kc-ranking-user-score">' + score + ' pts</span>' +
      '</a>';
    }).join('');

    return setRankingMarkup(container, signature, markup);
  }

  function getModuleIcon(mod) {
    if (!mod) return 'fas fa-campground';
    return MODULE_ICONS[mod] || 'fas fa-campground';
  }

  function getModuleLabel(mod) {
    return MODULE_LABELS[mod] || '';
  }

  function getVisibleModalFocusables(modal) {
    if (!modal || typeof modal.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) {
      if (element.hidden || (element.hasAttribute && element.hasAttribute('hidden'))) return false;
      if (element.closest && element.closest('[aria-hidden="true"]')) return false;
      var style = window.getComputedStyle ? window.getComputedStyle(element) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      return typeof element.getClientRects !== 'function' || element.getClientRects().length > 0;
    });
  }

  function closeInfoModal() {
    var modal = document.getElementById('kcRankingInfoModal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(false);
    }
    var returnFocus = infoModalReturnFocus;
    infoModalReturnFocus = null;
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try { returnFocus.focus(); } catch (_) {}
    }
  }

  function openInfoModal(trigger) {
    ensureInfoModal();
    var modal = document.getElementById('kcRankingInfoModal');
    if (!modal) return;
    infoModalReturnFocus = trigger || document.activeElement || null;
    modal.setAttribute('aria-hidden', 'false');
    if (window.KCAdminShell && typeof window.KCAdminShell.setModalOpen === 'function') {
      window.KCAdminShell.setModalOpen(true);
    }
    window.setTimeout(function () {
      var focusable = getVisibleModalFocusables(modal);
      var target = focusable[0] || modal;
      if (target && typeof target.focus === 'function') {
        try { target.focus(); } catch (_) {}
      }
    }, 40);
  }

  function ensureInfoModal() {
    if (document.getElementById('kcRankingInfoModal')) return;
    var modal = document.createElement('div');
    modal.id = 'kcRankingInfoModal';
    modal.className = 'kc-ranking-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'kcRankingInfoTitle');
    modal.setAttribute('aria-describedby', 'kcRankingInfoDescription');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('tabindex', '-1');
    modal.innerHTML =
      '<div class="kc-ranking-modal__backdrop" data-kc-ranking-modal-close aria-hidden="true"></div>' +
      '<div class="kc-ranking-modal__content">' +
        '<div class="kc-ranking-modal__header">' +
          '<h3 id="kcRankingInfoTitle"><i class="fas fa-trophy" style="color:var(--kc-primary-brand);" aria-hidden="true"></i> Como funciona o ranking?</h3>' +
          '<button type="button" data-kc-ranking-modal-close aria-label="Fechar"><i class="fas fa-times" aria-hidden="true"></i></button>' +
        '</div>' +
        '<div class="kc-ranking-modal__body">' +
          '<p id="kcRankingInfoDescription">O recorte seleciona publicações criadas e comentários feitos no período. Votos, cliques e compartilhamentos usam os totais atuais das publicações selecionadas; cada comentário escrito conta individualmente.</p>' +
          '<div class="kc-ranking-table-wrapper">' +
          '<table class="kc-ranking-score-table">' +
            '<thead><tr><th>Ação</th><th>Pontos</th></tr></thead>' +
            '<tbody>' +
              '<tr><td><i class="fas fa-file-alt" aria-hidden="true"></i> Publicação criada</td><td class="kc-ranking-pts">+15</td></tr>' +
              '<tr><td><i class="fas fa-thumbs-up" aria-hidden="true"></i> Voto positivo recebido</td><td class="kc-ranking-pts">+10</td></tr>' +
              '<tr><td><i class="fas fa-comment" aria-hidden="true"></i> Comentário escrito</td><td class="kc-ranking-pts">+5</td></tr>' +
              '<tr><td><i class="fas fa-hand-pointer" aria-hidden="true"></i> Anúncio acessado por alguém</td><td class="kc-ranking-pts">+4</td></tr>' +
              '<tr><td><i class="fas fa-share-alt" aria-hidden="true"></i> Publicação compartilhada</td><td class="kc-ranking-pts">+3</td></tr>' +
              '<tr><td><i class="fas fa-flag" aria-hidden="true"></i> Denúncia confirmada (visão administrativa)</td><td class="kc-ranking-pts kc-ranking-pts--neg">-50</td></tr>' +
            '</tbody>' +
          '</table>' +
          '</div>' +
          '<p style="font-size:0.85em;color:var(--kc-text-dark-secondary);margin-top:10px;">No dashboard administrativo, o ranking aceita hoje, 7, 30, 90 ou 365 dias e pode ser filtrado por módulo.</p>' +
        '</div>' +
        '<div class="kc-ranking-modal__footer">' +
          '<button type="button" class="kc-btn-primary" data-kc-ranking-modal-close><i class="fas fa-check" aria-hidden="true"></i> Entendido</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Wire close buttons on newly created modal
    modal.querySelectorAll('[data-kc-ranking-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeInfoModal);
    });
    modal.addEventListener('keydown', function (event) {
      if (modal.getAttribute('aria-hidden') !== 'false') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInfoModal();
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = getVisibleModalFocusables(modal);
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function initSidebarRanking() {
    if (document.querySelector('[data-kc-ranking-info], #admin-ranking-info-btn')) {
      ensureInfoModal();
    }

    var containers = document.querySelectorAll('[data-kc-ranking-sidebar]');
    if (!containers.length) return;

    containers.forEach(function (section) {
      var usersEl = section.querySelector('.kc-ranking-sidebar-users');
      if (!usersEl) return;

      var module = usersEl.dataset.kcRankingModule || null;
      var currentPeriod = 'month';

      var filters = section.querySelectorAll('.kc-ranking-filter[data-kc-ranking-period]');
      filters.forEach(function (btn) {
        btn.addEventListener('click', function () {
          filters.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          currentPeriod = btn.dataset.kcRankingPeriod;
          loadSidebarRanking(usersEl, currentPeriod, module);
        });
      });

      section.querySelectorAll('[data-kc-ranking-info]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openInfoModal(btn);
        });
      });

      loadSidebarRanking(usersEl, currentPeriod, module);
    });

  }

  // Session-backed stale-while-revalidate loader.
  function loadSidebarRanking(container, period, module, _retries) {
    var api = window.KCAPI;
    var cached = getCachedRanking(period, module);
    var hadCached = !!(cached && Array.isArray(cached.users));

    if (!api || typeof api.getTopContributors !== 'function') {
      var attempt = _retries || 0;
      if (hadCached) {
        renderSidebarRanking(container, cached.users, module);
        return Promise.resolve(cached.users);
      }
      if (attempt < 3) {
        container.innerHTML = '<span class="kc-ranking-empty" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="kc-sr-only">Carregando ranking…</span></span>';
        setTimeout(function () { loadSidebarRanking(container, period, module, attempt + 1); }, 350);
        return;
      }
      container.innerHTML = '<span class="kc-ranking-empty">Indisponivel.</span>';
      return;
    }

    if (hadCached) renderSidebarRanking(container, cached.users, module);
    else container.innerHTML = '<span class="kc-ranking-empty" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="kc-sr-only">Carregando ranking…</span></span>';

    if (hadCached && !shouldRevalidateRanking(cached)) {
      decorateAuthorAvatars(cached.users, module);
      return Promise.resolve(cached.users);
    }

    return requestRanking(period, module, 10).then(function (entry) {
      if (!hadCached || !cached || entry.signature !== cached.signature) {
        renderSidebarRanking(container, entry.users, module);
      } else {
        decorateAuthorAvatars(entry.users, module);
      }
      return entry.users;
    }).catch(function () {
      if (!hadCached) {
        container.innerHTML = '<span class="kc-ranking-empty">Erro ao carregar.</span>';
      }
      return hadCached ? cached.users : [];
    });
  }

  function loadHomeRanking(container, period, module, _retries) {
    var api = window.KCAPI;
    var cached = getCachedRanking(period, module);
    var hadCached = !!(cached && Array.isArray(cached.users));

    if (!api || typeof api.getTopContributors !== 'function') {
      var attempt = _retries || 0;
      if (hadCached) {
        renderHomeRanking(container, cached.users, module);
        return Promise.resolve(cached.users);
      }
      if (attempt < 3) {
        container.innerHTML = '<span class="kc-ranking-empty" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="kc-sr-only">Carregando ranking…</span></span>';
        setTimeout(function () { loadHomeRanking(container, period, module, attempt + 1); }, 350);
        return;
      }
      container.innerHTML = '<span class="kc-ranking-empty">Indisponivel.</span>';
      return;
    }

    if (hadCached) renderHomeRanking(container, cached.users, module);
    else container.innerHTML = '<span class="kc-ranking-empty" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span class="kc-sr-only">Carregando ranking…</span></span>';

    if (hadCached && !shouldRevalidateRanking(cached)) {
      return Promise.resolve(cached.users);
    }

    return requestRanking(period, module, 10).then(function (entry) {
      if (!hadCached || !cached || entry.signature !== cached.signature) {
        renderHomeRanking(container, entry.users, module);
      }
      return entry.users;
    }).catch(function () {
      if (!hadCached) {
        container.innerHTML = '<span class="kc-ranking-empty">Erro ao carregar ranking.</span>';
      }
      return hadCached ? cached.users : [];
    });
  }

  /**
   * Decorates .kc-card__author elements with ranking badges
   * if the author is in the top contributors list.
   */
  function decorateAuthorAvatars(users, module) {
    if (!users || !users.length) return;
    var iconClass = getModuleIcon(module);

    // Build lookup: userId → rank
    var rankMap = {};
    users.forEach(function (u, i) {
      rankMap[u.user_id] = i + 1;
    });

    // Decorate kc-card__author elements with data-author-id
    document.querySelectorAll('.kc-card__author[data-author-id]').forEach(function (el) {
      var authorId = el.dataset.authorId;
      if (!rankMap[authorId]) return;
      // Don't add duplicate badges
      if (el.querySelector('.kc-rank-badge')) return;

      var badge = document.createElement('span');
      badge.className = 'kc-rank-badge';
      badge.title = 'Top ' + rankMap[authorId] + (module ? ' ' + getModuleLabel(module) : ' Geral');
      badge.innerHTML = '<i class="' + iconClass + '" aria-hidden="true"></i>' + rankMap[authorId];
      el.appendChild(badge);
    });

    // Decorate profile avatar if on profile page
    var profileWrap = document.querySelector('.kc-profile-avatar-wrap');
    if (profileWrap) {
      var profileId = profileWrap.dataset.userId;
      if (profileId && rankMap[profileId]) {
        // Place badges container as a sibling after avatar-wrap, inside hero-top
        var heroTop = profileWrap.closest('.kc-profile-hero-top');
        var container = heroTop
          ? heroTop.querySelector('.kc-profile-rank-badges')
          : profileWrap.querySelector('.kc-profile-rank-badges');
        if (!container) {
          container = document.createElement('div');
          container.className = 'kc-profile-rank-badges';
          if (heroTop) {
            // Insert after avatar-wrap, before profile-info
            profileWrap.insertAdjacentElement('afterend', container);
          } else {
            profileWrap.appendChild(container);
          }
        }
        // Check if badge for this module already exists
        var modKey = module || 'general';
        if (!container.querySelector('[data-rank-module="' + modKey + '"]')) {
          var badge = document.createElement('span');
          badge.className = 'kc-rank-badge';
          badge.dataset.rankModule = modKey;
          badge.title = 'Top ' + rankMap[profileId] + (module ? ' ' + getModuleLabel(module) : ' Geral');
          badge.innerHTML = '<i class="' + iconClass + '" aria-hidden="true"></i>' + rankMap[profileId];
          container.appendChild(badge);
        }
      }
    }
  }

  function getUserRanks(userId) {
    var results = [];
    Object.keys(rankCache).forEach(function (mod) {
      var periods = rankCache[mod];
      var entry = periods['month'] || periods[Object.keys(periods)[0]];
      var users = entry && Array.isArray(entry.users) ? entry.users : null;
      if (!users) return;
      for (var i = 0; i < users.length; i++) {
        if (users[i].user_id === userId) {
          var realMod = mod === '__general__' ? null : mod;
          results.push({
            module: realMod,
            rank: i + 1,
            icon: getModuleIcon(realMod)
          });
          break;
        }
      }
    });
    return results;
  }

  // Expose for external use
  window.KCRanking = {
    loadSidebarRanking: loadSidebarRanking,
    loadHomeRanking: loadHomeRanking,
    renderSidebarRanking: renderSidebarRanking,
    renderHomeRanking: renderHomeRanking,
    ensureInfoModal: ensureInfoModal,
    getModuleIcon: getModuleIcon,
    getModuleLabel: getModuleLabel,
    decorateAuthorAvatars: decorateAuthorAvatars,
    getUserRanks: getUserRanks,
    getCachedRanking: getCachedRanking,
    fetchRanking: requestRanking,
    getCacheKey: getRankingCacheKey,
    openInfoModal: openInfoModal,
    closeInfoModal: closeInfoModal,
  };

  // Suporta carregamento via defer (DOMContentLoaded pendente) e lazy (DOM já pronto)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarRanking);
  } else {
    initSidebarRanking();
  }
}());
