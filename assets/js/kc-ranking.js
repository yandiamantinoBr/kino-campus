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
  var rankCache = {};

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
          '<h3><i class="fas fa-trophy" style="color:var(--kc-primary-brand);"></i> Como funciona o ranking?</h3>' +
          '<button type="button" data-kc-ranking-modal-close aria-label="Fechar"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '<div class="kc-ranking-modal__body">' +
          '<p>O ranking pontua os usuários mais engajados da plataforma com base nas seguintes ações:</p>' +
          '<table class="kc-ranking-score-table">' +
            '<thead><tr><th>Ação</th><th>Pontos</th></tr></thead>' +
            '<tbody>' +
              '<tr><td><i class="fas fa-file-alt"></i> Publicação criada</td><td class="kc-ranking-pts">+15</td></tr>' +
              '<tr><td><i class="fas fa-thumbs-up"></i> Voto positivo recebido</td><td class="kc-ranking-pts">+10</td></tr>' +
              '<tr><td><i class="fas fa-comment"></i> Comentário escrito</td><td class="kc-ranking-pts">+5</td></tr>' +
              '<tr><td><i class="fas fa-ticket"></i> Clique em cupom</td><td class="kc-ranking-pts">+4</td></tr>' +
              '<tr><td><i class="fas fa-share-nodes"></i> Compartilhamento</td><td class="kc-ranking-pts">+3</td></tr>' +
              '<tr><td><i class="fas fa-flag"></i> Denúncia confirmada</td><td class="kc-ranking-pts kc-ranking-pts--neg">-50</td></tr>' +
            '</tbody>' +
          '</table>' +
          '<p style="font-size:0.85em;color:var(--kc-text-dark-secondary);margin-top:10px;">Filtrável por período (hoje, semana, mês) e específico por módulo.</p>' +
        '</div>' +
        '<div class="kc-ranking-modal__footer">' +
          '<button type="button" class="kc-btn-primary" data-kc-ranking-modal-close><i class="fas fa-check"></i> Entendido</button>' +
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
        container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin"></i></span>';
        setTimeout(function () { loadSidebarRanking(container, period, module, attempt + 1); }, 350);
        return;
      }
      container.innerHTML = '<span class="kc-ranking-empty">Indisponível.</span>';
      return;
    }

    container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin"></i></span>';
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
          : '<i class="fas fa-user"></i>';
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

  // Expose for external use
  window.KCRanking = {
    loadSidebarRanking: loadSidebarRanking,
    ensureInfoModal: ensureInfoModal,
    getModuleIcon: getModuleIcon,
    getModuleLabel: getModuleLabel,
    decorateAuthorAvatars: decorateAuthorAvatars,
    getUserRanks: getUserRanks,
  };

  document.addEventListener('DOMContentLoaded', initSidebarRanking);
}());
