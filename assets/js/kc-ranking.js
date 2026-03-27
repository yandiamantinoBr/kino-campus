/* KinoCampus — kc-ranking.js
   Componente compartilhado de ranking "Top Contribuidores" para sidebars de módulos.
   Auto-detecta containers [data-kc-ranking-sidebar] e renderiza o ranking via KCAPI.
*/
(function () {
  'use strict';

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
  }

  function initSidebarRanking() {
    // Always ensure modal exists if any ranking info button is on the page
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

      // Filtros de período (se existem dentro da seção)
      var filters = section.querySelectorAll('.kc-ranking-filter[data-kc-ranking-period]');
      filters.forEach(function (btn) {
        btn.addEventListener('click', function () {
          filters.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          currentPeriod = btn.dataset.kcRankingPeriod;
          loadSidebarRanking(usersEl, currentPeriod, module);
        });
      });

      // Info modal
      section.querySelectorAll('[data-kc-ranking-info]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var modal = document.getElementById('kcRankingInfoModal');
          if (modal) modal.setAttribute('aria-hidden', 'false');
        });
      });

      // Carga inicial
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

  function loadSidebarRanking(container, period, module) {
    var api = window.KCAPI;
    if (!api || typeof api.getTopContributors !== 'function') {
      container.innerHTML = '<span class="kc-ranking-empty">Indisponível.</span>';
      return;
    }

    container.innerHTML = '<span class="kc-ranking-empty"><i class="fas fa-spinner fa-spin"></i></span>';

    api.getTopContributors(period, module, 10).then(function (users) {
      if (!users || users.length === 0) {
        container.innerHTML = '<span class="kc-ranking-empty">Nenhum contribuidor no período.</span>';
        return;
      }
      container.innerHTML = users.map(function (u, i) {
        var name = u.display_name || 'Usuário';
        var avatarSrc = u.avatar_url || '';
        var avatarHtml = avatarSrc
          ? '<img src="' + avatarSrc + '" alt="' + name + '" loading="lazy">'
          : '<i class="fas fa-user"></i>';
        return '<a href="profile.html?id=' + u.user_id + '" class="kc-ranking-sidebar-item">' +
          '<span class="kc-ranking-sidebar-item__pos">' + (i + 1) + '</span>' +
          '<span class="kc-ranking-sidebar-item__avatar">' + avatarHtml + '</span>' +
          '<span class="kc-ranking-sidebar-item__name">' + name + '</span>' +
          '<span class="kc-ranking-sidebar-item__score">' + u.score + ' pts</span>' +
        '</a>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<span class="kc-ranking-empty">Erro ao carregar.</span>';
    });
  }

  // Expor para uso externo (admin dashboard)
  window.KCRanking = {
    loadSidebarRanking: loadSidebarRanking,
    ensureInfoModal: ensureInfoModal,
  };

  document.addEventListener('DOMContentLoaded', initSidebarRanking);
}());
