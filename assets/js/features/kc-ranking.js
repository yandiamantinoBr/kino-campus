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
      var name = u.display_name || 'Usuario';
      var avatarSrc = u.avatar_url || '';
      var avatarHtml = avatarSrc
        ? '<img src="' + avatarSrc + '" alt="' + name + '" loading="lazy">'
        : '<i class="fas fa-user" aria-hidden="true"></i>';
      return '<a href="profile.html?id=' + u.user_id + '" class="kc-ranking-sidebar-item">' +
        '<span class="kc-ranking-sidebar-item__pos"><i class="' + iconClass + '" style="font-size:0.85em;margin-right:2px;"></i>' + (i + 1) + '</span>' +
        '<span class="kc-ranking-sidebar-item__avatar">' + avatarHtml + '</span>' +
        '<span class="kc-ranking-sidebar-item__name">' + name + '</span>' +
        '<span class="kc-ranking-sidebar-item__score">' + u.score + ' pts</span>' +
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
      var name = u.display_name || 'Usuario';
      var avatarSrc = u.avatar_url || '';
      var avatarHtml = avatarSrc
        ? '<img src="' + avatarSrc + '" alt="' + name + '" loading="lazy">'
        : '<i class="fas fa-user" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:0.9em;color:var(--kc-text-dark-secondary);" aria-hidden="true"></i>';
      return '<a href="profile.html?id=' + u.user_id + '" class="kc-ranking-user" title="' + name + ' - ' + u.score + ' pts">' +
        '<div class="kc-ranking-user-avatar">' + avatarHtml +
          '<span class="kc-ranking-user-position"><i class="' + iconClass + '"></i>' + (i + 1) + '</span>' +
        '</div>' +
        '<span class="kc-ranking-user-name">' + name + '</span>' +
        '<span class="kc-ranking-user-score">' + u.score + ' pts</span>' +
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

  function ensureInfoModal() {
    if (document.getElementById('kcRankingInfoModal')) return;
    var modal = document.createElement('div');
    modal.id = 'kcRankingInfoModal';
    modal.className = 'kc-ranking-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML =
      '<div class="kc-ranking-modal__backdrop" data-kc-ranking-modal-close></div>' +
      '<div class="kc-ranking-modal__content">' +
        '<div class="kc-ranking-modal__header">' +
          '<h3><i class="fas fa-trophy" style="color:var(--kc-primary-brand);" aria-hidden="true"></i> Como funciona o ranking?</h3>' +
          '<button type="button" data-kc-ranking-modal-close aria-label="Fechar"><i class="fas fa-times" aria-hidden="true"></i></button>' +
        '</div>' +
        '<div class="kc-ranking-modal__body">' +
          '<p>O ranking pontua os usuários mais ativos e úteis da comunidade. Cada ação é contabilizada <strong>uma única vez por publicação</strong> — ações repetidas no mesmo post não somam pontos extras.</p>' +
          '<div class="kc-ranking-table-wrapper">' +
          '<table class="kc-ranking-score-table">' +
            '<thead><tr><th>Ação</th><th>Pontos</th></tr></thead>' +
            '<tbody>' +
              '<tr><td><i class="fas fa-file-alt" aria-hidden="true"></i> Publicação criada</td><td class="kc-ranking-pts">+15</td></tr>' +
              '<tr><td><i class="fas fa-thumbs-up" aria-hidden="true"></i> Voto positivo recebido</td><td class="kc-ranking-pts">+10</td></tr>' +
              '<tr><td><i class="fas fa-comment" aria-hidden="true"></i> Comentário escrito</td><td class="kc-ranking-pts">+5</td></tr>' +
              '<tr><td><i class="fas fa-hand-pointer" aria-hidden="true"></i> Anúncio acessado por alguém</td><td class="kc-ranking-pts">+4</td></tr>' +
              '<tr><td><i class="fas fa-share-alt" aria-hidden="true"></i> Publicação compartilhada</td><td class="kc-ranking-pts">+3</td></tr>' +
              '<tr><td><i class="fas fa-flag" aria-hidden="true"></i> Denúncia confirmada (penalidade)</td><td class="kc-ranking-pts kc-ranking-pts--neg">-50</td></tr>' +
            '</tbody>' +
          '</table>' +
          '</div>' +
          '<p style="font-size:0.85em;color:var(--kc-text-dark-secondary);margin-top:10px;">Filtrável por período (hoje, semana ou mês) e por módulo nas páginas de cada categoria.</p>' +
        '</div>' +
        '<div class="kc-ranking-modal__footer">' +
          '<button type="button" class="kc-btn-primary" data-kc-ranking-modal-close><i class="fas fa-check" aria-hidden="true"></i> Entendido</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    // Wire close buttons on newly created modal
    modal.querySelectorAll('[data-kc-ranking-modal-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        modal.setAttribute('aria-hidden', 'true');
      });
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
          ensureInfoModal();
          var modal = document.getElementById('kcRankingInfoModal');
          if (modal) modal.setAttribute('aria-hidden', 'false');
        });
      });

      loadSidebarRanking(usersEl, currentPeriod, module);
    });

    // Wire modal close buttons (global)
    document.querySelectorAll('[data-kc-ranking-modal-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        var modal = el.closest('.kc-ranking-modal');
        if (modal) modal.setAttribute('aria-hidden', 'true');
      });
    });
  }

  function loadSidebarRanking(container, period, module, _retries) {
    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      var attempt = _retries || 0;
      if (attempt < 3) {
        container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>';
        setTimeout(function () { loadSidebarRanking(container, period, module, attempt + 1); }, 350);
        return;
      }
      container.innerHTML = '<span class="kc-ranking-empty">Indisponível.</span>';
      return;
    }

    container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>';
    var iconClass = getModuleIcon(module);

    api.getTopContributors(period, module, 10).then(function (users) {
      if (!users || users.length === 0) {
        container.innerHTML = '<span class="kc-ranking-empty">Nenhum contribuidor no período.</span>';
        return;
      }

      // Cache results
      var cacheKey = module || '__general__';
      if (!rankCache[cacheKey]) rankCache[cacheKey] = {};
      rankCache[cacheKey][period] = users;

      container.innerHTML = users.map(function (u, i) {
        var name = u.display_name || 'Usuário';
        var avatarSrc = u.avatar_url || '';
        var avatarHtml = avatarSrc
          ? '<img src="' + avatarSrc + '" alt="' + name + '" loading="lazy">'
          : '<i class="fas fa-user" aria-hidden="true"></i>';
        return '<a href="profile.html?id=' + u.user_id + '" class="kc-ranking-sidebar-item">' +
          '<span class="kc-ranking-sidebar-item__pos"><i class="' + iconClass + '" style="font-size:0.85em;margin-right:2px;"></i>' + (i + 1) + '</span>' +
          '<span class="kc-ranking-sidebar-item__avatar">' + avatarHtml + '</span>' +
          '<span class="kc-ranking-sidebar-item__name">' + name + '</span>' +
          '<span class="kc-ranking-sidebar-item__score">' + u.score + ' pts</span>' +
        '</a>';
      }).join('');

      // Decorate avatars in the page after data loads
      decorateAuthorAvatars(users, module);
    }).catch(function () {
      container.innerHTML = '<span class="kc-ranking-empty">Erro ao carregar.</span>';
    });
  }

  // Override legacy loader with session-backed stale-while-revalidate behavior.
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
        container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>';
        setTimeout(function () { loadSidebarRanking(container, period, module, attempt + 1); }, 350);
        return;
      }
      container.innerHTML = '<span class="kc-ranking-empty">Indisponivel.</span>';
      return;
    }

    if (hadCached) renderSidebarRanking(container, cached.users, module);
    else container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>';

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
        container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>';
        setTimeout(function () { loadHomeRanking(container, period, module, attempt + 1); }, 350);
        return;
      }
      container.innerHTML = '<span class="kc-ranking-empty">Indisponivel.</span>';
      return;
    }

    if (hadCached) renderHomeRanking(container, cached.users, module);
    else container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></span>';

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
      badge.innerHTML = '<i class="' + iconClass + '"></i>' + rankMap[authorId];
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
          badge.innerHTML = '<i class="' + iconClass + '"></i>' + rankMap[profileId];
          container.appendChild(badge);
        }
      }
    }
  }

  /**
   * Get cached rank data for a user across all loaded modules.
   * Returns array: [ { module, rank, icon } ]
   */
  function getUserRanks(userId) {
    var results = [];
    Object.keys(rankCache).forEach(function (mod) {
      var periods = rankCache[mod];
      // Use 'month' as default, fallback to any available period
      var users = periods['month'] || periods[Object.keys(periods)[0]];
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
  };

  // Suporta carregamento via defer (DOMContentLoaded pendente) e lazy (DOM já pronto)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarRanking);
  } else {
    initSidebarRanking();
  }
}());
